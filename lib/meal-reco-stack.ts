import * as cdk from 'aws-cdk-lib';
import {Construct} from 'constructs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as s3n from 'aws-cdk-lib/aws-s3-notifications';
import * as path from 'path';
import * as fs from 'fs';
import {Bucket} from "aws-cdk-lib/aws-s3";

import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as sagemaker from 'aws-cdk-lib/aws-sagemaker';
import {PhysicalName} from "aws-cdk-lib";
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';


import * as personalize from 'aws-cdk-lib/aws-personalize';


import {PolicyStatement} from "aws-cdk-lib/aws-iam";
import {Duration} from "aws-cdk-lib";
import {Cors, LambdaIntegration, MethodLoggingLevel, RestApi} from "aws-cdk-lib/aws-apigateway";

export class MealRecommendationStack extends cdk.Stack {
    public readonly mealRecommendationBucket: s3.Bucket;
    public usersTable: dynamodb.Table;
    public menusTable: dynamodb.Table;
    public interactionsTable: dynamodb.Table;
    public ingredientsTable: dynamodb.Table;


    constructor(scope: Construct, id: string, props?: cdk.StackProps) {
        super(scope, id, props);

        // Define the bucket name with account ID
        const accountId = cdk.Stack.of(this).account;
        const bucketName = `meal-recommendation-${accountId}`;

        // Create  the S3 bucket to hold CSV files
        this.mealRecommendationBucket = new s3.Bucket(this, 'MealRecommendationBucket', {
            bucketName: bucketName,
            removalPolicy: cdk.RemovalPolicy.DESTROY,
            autoDeleteObjects: true,
        });

        // Add bucket policy for Amazon Personalize
        const bucketPolicy = new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            principals: [new iam.ServicePrincipal('personalize.amazonaws.com')],
            actions: ['s3:GetObject', 's3:ListBucket'],
            resources: [
                this.mealRecommendationBucket.bucketArn,
                `${this.mealRecommendationBucket.bucketArn}/*`
            ],
        });
        this.mealRecommendationBucket.addToResourcePolicy(bucketPolicy);



        // Create temporary directory for deployment
        const tempDir = path.join(__dirname, 'temp');
        if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir);
        }

        // Create empty files to represent folders
        const folders = ['raw/', 'formated/', 'curated/'];
        folders.forEach(folder => {
            const filePath = path.join(tempDir, folder);
            fs.mkdirSync(filePath, {recursive: true});
            fs.writeFileSync(path.join(filePath, '.dummy'), ''); // Placeholder file
        });

        // Deploy the folders to S3
        new s3deploy.BucketDeployment(this, 'CSVFolders', {
            sources: [s3deploy.Source.asset(tempDir)],
            destinationBucket: this.mealRecommendationBucket,
            destinationKeyPrefix: "data"
        });

        // Clean up temporary files after deployment
        fs.rmSync(tempDir, {recursive: true, force: true});

        this.addDataLakeProcessingLambda( this.mealRecommendationBucket, 'raw');
        this.addDataLakeProcessingLambda(this.mealRecommendationBucket, 'formated');
        const curatedFunction = this.addDataLakeProcessingLambda(this.mealRecommendationBucket, 'curated');

        // Add DynamoDB tables
        this.addDynamoDBTables();
        this.usersTable.grantReadWriteData(curatedFunction);
        this.menusTable.grantReadWriteData(curatedFunction);
        this.interactionsTable.grantReadWriteData(curatedFunction);
        this.ingredientsTable.grantReadWriteData(curatedFunction);

        this.addPersonalize(this.mealRecommendationBucket)

        this.addSagemaker(this.mealRecommendationBucket)

        this.addApigateway(this.mealRecommendationBucket)
    }


    private addDataLakeProcessingLambda(bucket: Bucket, lakeStage: string) {

        // Define the Lambda function
        const lambdaFunction = new lambda.Function(this, `RecommendationLambda_${lakeStage}`, {
            functionName: `recommendation_Lambda_${lakeStage}`,
            runtime: lambda.Runtime.NODEJS_18_X,
            memorySize: 8192,
            timeout: Duration.minutes(15),
            handler: `index.handler`,
            code: lambda.Code.fromAsset(path.join(__dirname, `../src/lambda/${lakeStage}/dist`)),
            environment: {
                BUCKET_NAME: bucket.bucketName,
            },
        });

        // Grant the Lambda function permissions to read and write from the bucket
        bucket.grantReadWrite(lambdaFunction);

        // Add an event notification for the "data/..." folder
        bucket.addEventNotification(
            s3.EventType.OBJECT_CREATED,
            new s3n.LambdaDestination(lambdaFunction),
            {prefix: `data/${lakeStage}/`}
        );


        const lambdaPolicy = new PolicyStatement()
        // Permission to call bedrock models
        lambdaPolicy.addActions("bedrock:InvokeModel")
        lambdaPolicy.addResources(
            `arn:aws:bedrock:*::foundation-model/*`,
        )

        lambdaFunction.addToRolePolicy(lambdaPolicy)

        return lambdaFunction
    }

    private addSagemaker(existingBucket: Bucket) {
        // Create a new VPC
        const vpc = new ec2.Vpc(this, 'SageMakerVPC', {
            maxAzs: 2,
            natGateways: 1,
        });

        // Create IAM role for SageMaker
        const sageMakerRole = new iam.Role(this, 'SageMakerExecutionRole', {
            roleName: PhysicalName.GENERATE_IF_NEEDED,
            assumedBy: new iam.CompositePrincipal(
                new iam.ServicePrincipal('sagemaker.amazonaws.com'),
                new iam.ServicePrincipal('ec2.amazonaws.com')
            ),
            managedPolicies: [
                iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonSageMakerFullAccess'),
            ],
        });
        // Grant SageMaker role access to the existing S3 bucket
        existingBucket.grantRead(sageMakerRole);



        // Modify the BucketDeployment to use PhysicalName.GENERATE_IF_NEEDED
        new s3deploy.BucketDeployment(this, 'DeployNotebook', {
            sources: [s3deploy.Source.asset(path.join(__dirname, '../src/sagemaker'))],
            destinationBucket: existingBucket,
            destinationKeyPrefix: 'notebook',
            role: new iam.Role(this, 'BucketDeploymentRole', {
                roleName: PhysicalName.GENERATE_IF_NEEDED,
                assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
            }),
        });


        // Create SageMaker Domain
        const domain = new sagemaker.CfnDomain(this, 'SageMakerDomain', {
            authMode: 'IAM',
            defaultUserSettings: {
                executionRole: sageMakerRole.roleArn,
            },
            defaultSpaceSettings: {
                executionRole: sageMakerRole.roleArn,
                jupyterServerAppSettings: {
                    defaultResourceSpec: {
                        instanceType: 'system',
                        sageMakerImageArn: 'arn:aws:sagemaker:us-east-1:081325390199:image/jupyter-server-3',
                    },
                },
                kernelGatewayAppSettings: {
                    defaultResourceSpec: {
                        instanceType: 'ml.t3.medium',
                        sageMakerImageArn: 'arn:aws:sagemaker:us-east-1:081325390199:image/sagemaker-data-science-311-v1',
                    },
                },
            },
            domainName: 'MySageMakerDomain',
            vpcId: vpc.vpcId,
            subnetIds: vpc.selectSubnets({ subnetType: ec2.SubnetType.PRIVATE_WITH_NAT }).subnetIds,
            appNetworkAccessType: 'PublicInternetOnly',
        });

        // Create User Profile
        new sagemaker.CfnUserProfile(this, 'DefaultUserProfile', {
            domainId: domain.attrDomainId,
            userProfileName: 'default-user',
            userSettings: {
                executionRole: sageMakerRole.roleArn,
                jupyterServerAppSettings: {
                    defaultResourceSpec: {
                        instanceType: 'system',
                        sageMakerImageArn: 'arn:aws:sagemaker:us-east-1:081325390199:image/jupyter-server-3',
                    },
                },
                kernelGatewayAppSettings: {
                    defaultResourceSpec: {
                        instanceType: 'ml.t3.medium',
                        sageMakerImageArn: 'arn:aws:sagemaker:us-east-1:081325390199:image/sagemaker-data-science-311-v1',
                    },
                },
            },
        });

        // Create JupyterLab Space
        new sagemaker.CfnSpace(this, 'JupyterLabSpace', {
            domainId: domain.attrDomainId,
            spaceName: 'MyJupyterLabSpace',
            spaceSettings: {
                jupyterServerAppSettings: {
                    defaultResourceSpec: {
                        instanceType: 'system',
                        sageMakerImageArn: 'arn:aws:sagemaker:us-east-1:081325390199:image/jupyter-server-3',
                    },
                },
            },
        });

        // Output the Domain ID and notebook location
        new cdk.CfnOutput(this, 'SageMakerDomainId', {
            value: domain.attrDomainId,
            description: 'SageMaker Domain ID',
        });

        new cdk.CfnOutput(this, 'NotebookLocation', {
            value: `s3://${existingBucket.bucketName}/notebook/`,
            description: 'S3 location of the uploaded notebook',
        });
    }

    private addApigateway(bucket: Bucket) {


        // Create an API Gateway
        const api = new RestApi(this, 'MealRecommendationApi', {
            deployOptions: {
                stageName: "beta",
                metricsEnabled: true,
                loggingLevel: MethodLoggingLevel.INFO,
                dataTraceEnabled: true,
            },
            defaultCorsPreflightOptions: {
                allowOrigins: Cors.ALL_ORIGINS, // Replace with your allowed origins
                allowMethods: Cors.ALL_METHODS, // Allow all HTTP methods
                allowHeaders: ["*"], // Add any required headers
                allowCredentials: true
            },
        })
        // Output the API URL
        new cdk.CfnOutput(this, 'ApiUrl', {
            value: api.url,
            description: 'API Gateway URL',
        });



        const inferenceFunction = new lambda.Function(this, 'InferenceLambda', {
            functionName: 'recommendation_Lambda_meal_inference',
            runtime: lambda.Runtime.NODEJS_18_X,
            handler: 'index.handler',
            code: lambda.Code.fromAsset(path.join(__dirname, '../src/lambda/menu_inference')),
            environment: {
                PINECONE_API_KEY: 'PUT-YOUR-PINECONE-KEY',
                BUCKET_NAME: bucket.bucketName,
            },
            timeout: Duration.seconds(120),
            memorySize: 4096,
        });
        // Create resources and methods for the API
        const searchResource = api.root.addResource('search');
        searchResource.addMethod('GET', new apigateway.LambdaIntegration(inferenceFunction), {
            methodResponses: [{
                statusCode: '200',
                responseParameters: {
                    'method.response.header.Access-Control-Allow-Origin': true,
                },
            }],
        });





        const usersFunction = new lambda.Function(this, 'UsersLambda', {
            functionName: 'recommendation_Lambda_api_users',
            runtime: lambda.Runtime.NODEJS_18_X,
            handler: 'index.handler',
            code: lambda.Code.fromAsset(path.join(__dirname, '../src/lambda/api_users')),
            environment: {
                USERS_TABLE_NAME: this.usersTable.tableName,
            },
            timeout: Duration.seconds(120),
            memorySize: 2048,
        });
        // Grant read access to the users table
        this.usersTable.grantReadData(usersFunction);
        this.interactionsTable.grantReadData(usersFunction);

        const usersResource = api.root.addResource('users');
        usersResource.addMethod('GET', new apigateway.LambdaIntegration(usersFunction), {
            methodResponses: [{
                statusCode: '200',
                responseParameters: {
                    'method.response.header.Access-Control-Allow-Origin': true,
                },
            }],
        });




        const menusFunction = new lambda.Function(this, 'MenusLambda', {
            functionName: 'recommendation_Lambda_api_menus',
            runtime: lambda.Runtime.NODEJS_18_X,
            handler: 'index.handler',
            code: lambda.Code.fromAsset(path.join(__dirname, '../src/lambda/api_menus')),
            environment: {
                MENUS_TABLE_NAME: this.menusTable.tableName,
                PERSONALIZE_REGION: cdk.Stack.of(this).region,
                ACCOUNT_ID: cdk.Stack.of(this).account,
            },
            timeout: Duration.seconds(120),
            memorySize: 2048,
        });

        this.ingredientsTable.grantReadData(menusFunction);


        // Grant read access to the menus table for the recommendations function
        this.menusTable.grantReadData(menusFunction);
        const menusPolicy = new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: [
                'personalize:GetRecommendations',
                'personalize:DescribeRecommender'
            ],
            resources: ['*'] // You might want to restrict this to the specific recommender ARN
        });
        menusPolicy.addActions("bedrock:InvokeModel")
        menusPolicy.addResources(
            `arn:aws:bedrock:*::foundation-model/*`,
        )
        menusFunction.addToRolePolicy(menusPolicy);



        //  resource and method for menu recommendations
        const menusResource = api.root.addResource('menus');
        menusResource.addMethod('GET', new apigateway.LambdaIntegration(menusFunction), {
            methodResponses: [{
                statusCode: '200',
                responseParameters: {
                    'method.response.header.Access-Control-Allow-Origin': true,
                },
            }],
        });




    }


    private addDynamoDBTables() {
        // Users table
        this.usersTable = new dynamodb.Table(this, 'UsersTable', {
            tableName: 'users',
            partitionKey: { name: 'user_id', type: dynamodb.AttributeType.STRING },
            billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
        });

        this.usersTable.addGlobalSecondaryIndex({
            indexName: 'created_at_index',
            partitionKey: { name: 'user_id', type: dynamodb.AttributeType.STRING },
            sortKey: { name: 'created_at', type: dynamodb.AttributeType.NUMBER },
        });

        // Menus table
        this.menusTable = new dynamodb.Table(this, 'MenusTable', {
            tableName: 'menus',
            partitionKey: { name: 'item_id', type: dynamodb.AttributeType.STRING },
            billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
        });
        this.menusTable.addGlobalSecondaryIndex({
            indexName: 'created_at_index',
            partitionKey: { name: 'item_id', type: dynamodb.AttributeType.STRING },
            sortKey: { name: 'created_at', type: dynamodb.AttributeType.NUMBER },
        });

        // Interactions table
        this.interactionsTable = new dynamodb.Table(this, 'InteractionsTable', {
            tableName: 'interactions',
            partitionKey: { name: 'item_id', type: dynamodb.AttributeType.STRING },
            sortKey: { name: 'user_id', type: dynamodb.AttributeType.STRING },
            billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
        });

        this.interactionsTable.addGlobalSecondaryIndex({
            indexName: 'user_id_index',
            partitionKey: { name: 'user_id', type: dynamodb.AttributeType.STRING },
            sortKey: { name: 'created_at', type: dynamodb.AttributeType.NUMBER },
        });

        this.interactionsTable.addGlobalSecondaryIndex({
            indexName: 'wanted_index',
            partitionKey: { name: 'wanted', type: dynamodb.AttributeType.NUMBER },
        });
        this.interactionsTable.addGlobalSecondaryIndex({
            indexName: 'liked_index',
            partitionKey: { name: 'liked', type: dynamodb.AttributeType.NUMBER },
        });


        // New Ingredients table
        this.ingredientsTable = new dynamodb.Table(this, 'IngredientsTable', {
            tableName: 'ingredients',
            partitionKey: { name: 'name', type: dynamodb.AttributeType.STRING },
            billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
        });

        // Add a Global Secondary Index to allow sorting by count
        this.ingredientsTable.addGlobalSecondaryIndex({
            indexName: 'count_index',
            partitionKey: { name: 'dummy', type: dynamodb.AttributeType.STRING }, // Dummy attribute for partitioning
            sortKey: { name: 'count', type: dynamodb.AttributeType.NUMBER },
            projectionType: dynamodb.ProjectionType.ALL
        });
    }

    private addPersonalize(bucket: s3.Bucket) {
        // Create the dataset group
        const datasetGroup = new personalize.CfnDatasetGroup(this, 'MealRecommendationDatasetGroup', {
            name: 'meal-recommendation-dataset',
            domain: 'VIDEO_ON_DEMAND'
        });

        // Create the schema for menus (items)
        const menusSchema = new personalize.CfnSchema(this, 'MenusSchema', {
            name: 'meal-recommendation-menus-schema',
            domain: 'VIDEO_ON_DEMAND',
            schema: JSON.stringify({
                type: "record",
                name: "Items",
                namespace: "com.amazonaws.personalize.schema",
                fields: [
                    { name: "ITEM_ID", type: "string" },
                    { name: "PRICE", type: "float" },
                    { name: "CREATION_TIMESTAMP", type: "long" },
                    { name: "GENRES", type: "string", categorical: true },
                    { name: "GENRE_L2", type: "string", categorical: true },
                    { name: "GENRE_L3", type: "string", categorical: true },
                    { name: "PRODUCT_DESCRIPTION", type: "string", textual: true },
                    { name: "CONTENT_CLASSIFICATION", type: "string", categorical: true }
                ],
                version: "1.0"
            })
        });

        // Create the menus (items) dataset
        const menusDataset = new personalize.CfnDataset(this, 'MenusDataset', {
            datasetGroupArn: datasetGroup.attrDatasetGroupArn,
            datasetType: 'Items',
            name: 'meal-recommendation-menus',
            schemaArn: menusSchema.attrSchemaArn
        });


        // Create the schema for interactions
        const interactionsSchema = new personalize.CfnSchema(this, 'InteractionsSchema', {
            name: 'meal-recommendation-interactions-schema',
            domain: 'VIDEO_ON_DEMAND',
            schema: JSON.stringify({
                type: "record",
                name: "Interactions",
                namespace: "com.amazonaws.personalize.schema",
                fields: [
                    { name: "USER_ID", type: "string" },
                    { name: "ITEM_ID", type: "string" },
                    { name: "EVENT_TYPE", type: "string" },
                    { name: "EVENT_VALUE", type: "float" },
                    { name: "TIMESTAMP", type: "long" }
                ],
                version: "1.0"
            })
        });

        // Create the interactions dataset
        const interactionsDataset = new personalize.CfnDataset(this, 'InteractionsDataset', {
            datasetGroupArn: datasetGroup.attrDatasetGroupArn,
            datasetType: 'Interactions',
            name: 'meal-recommendation-interactions',
            schemaArn: interactionsSchema.attrSchemaArn
        });

        // Create the schema for users
        const usersSchema = new personalize.CfnSchema(this, 'UsersSchema', {
            name: 'meal-recommendation-users-schema',
            domain: 'VIDEO_ON_DEMAND',
            schema: JSON.stringify({
                type: "record",
                name: "Users",
                namespace: "com.amazonaws.personalize.schema",
                fields: [
                    { name: "USER_ID", type: "string" },
                    { name: "INTEREST", type: "string", categorical: true }
                ],
                version: "1.0"
            })
        });

        // Create the users dataset
        const usersDataset = new personalize.CfnDataset(this, 'UsersDataset', {
            datasetGroupArn: datasetGroup.attrDatasetGroupArn,
            datasetType: 'Users',
            name: 'meal-recommendation-users',
            schemaArn: usersSchema.attrSchemaArn
        });


        // Create an IAM role for Personalize
        const personalizeRole = new iam.Role(this, 'PersonalizeRole', {
            assumedBy: new iam.ServicePrincipal('personalize.amazonaws.com'),
        });

        // Grant Personalize read access to the S3 bucket
        bucket.grantRead(personalizeRole);

        // Add necessary permissions for Personalize
        personalizeRole.addToPolicy(new iam.PolicyStatement({
            actions: [
                'personalize:CreateDatasetImportJob',
                'personalize:DescribeDatasetImportJob',
                'personalize:ListDatasetImportJobs',
            ],
            resources: ['*'],
        }));



        // Output the Dataset Group ARN
        new cdk.CfnOutput(this, 'PersonalizeDatasetGroupArn', {
            value: datasetGroup.attrDatasetGroupArn,
            description: 'Amazon Personalize Dataset Group ARN',
        });
    }
}