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


import * as amplify from 'aws-cdk-lib/aws-amplify';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';


import {PolicyStatement} from "aws-cdk-lib/aws-iam";
import {Duration} from "aws-cdk-lib";

export class MealRecommendationStack extends cdk.Stack {
    public readonly mealRecommendationBucket: s3.Bucket;

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


        this.addSagemaker(this.mealRecommendationBucket)


        this.addInferenceLambda(this.mealRecommendationBucket)

        this.addFrontEnd();
    }


    private addDataLakeProcessingLambda(bucket: Bucket, lakeStage: string) {

        // Define the Lambda function
        const lambdaFunction = new lambda.Function(this, `RecommendationLambda_${lakeStage}`, {
            functionName: `recommendation_Lambda_${lakeStage}`,
            runtime: lambda.Runtime.NODEJS_18_X,
            memorySize: 8192,
            timeout: Duration.minutes(10),
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

    private addInferenceLambda(bucket: Bucket) {
        const inferenceFunction = new lambda.Function(this, 'InferenceLambda', {
            functionName: 'recommendation_Lambda_meal_inference',
            runtime: lambda.Runtime.NODEJS_18_X,
            handler: 'index.handler',
            code: lambda.Code.fromAsset(path.join(__dirname, '../src/lambda/menu_inference')),
            environment: {
                PINECONE_API_KEY: 'e5d50c57-2444-498a-9c3d-e6cd2e3a57ad',
                BUCKET_NAME: bucket.bucketName,
            },
            timeout: Duration.seconds(60),
            memorySize: 2048,
        });

        // Create an API Gateway
        const api = new apigateway.RestApi(this, 'MealRecommendationApi', {
            restApiName: 'Meal Recommendation Service',
        });

        // Create a resource and method for the API
        const searchResource = api.root.addResource('search');
        searchResource.addMethod('GET', new apigateway.LambdaIntegration(inferenceFunction));

        // Output the API URL
        new cdk.CfnOutput(this, 'ApiUrl', {
            value: api.url,
            description: 'API Gateway URL',
        });
    }


    private addFrontEnd() {
        // Create the Amplify app
        const amplifyApp = new amplify.CfnApp(this, 'MealRecoWebApp', {
            name: 'MealRecoWebApp',
            repository: 'https://github.com/<your-github-username>/<your-repository-name>',
            accessToken: secretsmanager.Secret.fromSecretNameV2(this, 'GitHubToken', 'github-access-token').secretValue.toString(),
            buildSpec: JSON.stringify({
                version: 1,
                frontend: {
                    phases: {
                        preBuild: {
                            commands: [
                                'cd src/web',
                                'npm ci'
                            ]
                        },
                        build: {
                            commands: [
                                'npm run build'
                            ]
                        }
                    },
                    artifacts: {
                        baseDirectory: 'src/web/build',
                        files: ['**/*']
                    }
                }
            })
        });

        // Add a branch for the main branch
        const mainBranch = new amplify.CfnBranch(this, 'MainBranch', {
            appId: amplifyApp.attrAppId,
            branchName: 'main',
            enableAutoBuild: true,
            stage: 'PRODUCTION'
        });

        // Output the Amplify app URL
        new cdk.CfnOutput(this, 'AmplifyAppURL', {
            value: `https://${mainBranch.attrBranchName}.${amplifyApp.attrDefaultDomain}`,
            description: 'URL of the Amplify app'
        });
    }
}