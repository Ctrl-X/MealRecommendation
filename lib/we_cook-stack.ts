import * as cdk from 'aws-cdk-lib';
import {Construct} from 'constructs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as s3n from 'aws-cdk-lib/aws-s3-notifications';
import * as path from 'path';
import * as fs from 'fs';
import {Bucket} from "aws-cdk-lib/aws-s3";
import * as iam from 'aws-cdk-lib/aws-iam';
import * as glue from 'aws-cdk-lib/aws-glue';

export class WeCookStack extends cdk.Stack {
    constructor(scope: Construct, id: string, props?: cdk.StackProps) {
        super(scope, id, props);

        // Define the bucket name with account ID
        const accountId = cdk.Stack.of(this).account;
        const bucketName = `meal-recommendation-${accountId}`;

        // Create  the S3 bucket to hold CSV files
        const bucket = new s3.Bucket(this, 'MealRecommendationBucket', {
            bucketName: bucketName,
            removalPolicy: cdk.RemovalPolicy.DESTROY,
            autoDeleteObjects: true,
        });

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
            destinationBucket: bucket,
            destinationKeyPrefix: "data"
        });

        // Clean up temporary files after deployment
        fs.rmSync(tempDir, {recursive: true, force: true});

        this.addDataLakeProcessingLambda( bucket, 'raw');
        this.addDataLakeProcessingLambda(bucket, 'formated');

        // TODO : regarder le formated lambda et continuer le travail pour finir sur le curated


        //
        //
        //
        //
        // // Create IAM role for Glue
        // const glueRole = new iam.Role(this, 'GlueETLRole', {
        //     assumedBy: new iam.ServicePrincipal('glue.amazonaws.com'),
        //     description: 'IAM role for Glue ETL job',
        // });
        //
        //
        //
        // // Grant necessary permissions to the Glue role
        // glueRole.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSGlueServiceRole'));
        // bucket.grantReadWrite(glueRole);
        //
        // // Create Glue Database
        // const glueDatabase = new glue.CfnDatabase(this, 'MealRecommendationDB', {
        //     catalogId: this.account,
        //     databaseInput: {
        //         name: 'meal_recommendation_db',
        //         description: 'Database for meal recommendation data',
        //     },
        // });
        //
        //
        //
        // // Create Glue Crawler
        // const glueCrawler = new glue.CfnCrawler(this, 'MealRecommendationCrawler', {
        //     name: 'meal-recommendation-crawler',
        //     role: glueRole.roleArn,
        //     databaseName: glueDatabase.ref,
        //     targets: {
        //         s3Targets: [
        //             {
        //                 path: `s3://${bucket.bucketName}/data/raw/`,
        //                 exclusions: ['**/.dummy'],
        //             },
        //         ],
        //     },
        //     schemaChangePolicy: {
        //         updateBehavior: 'UPDATE_IN_DATABASE',
        //         deleteBehavior: 'LOG',
        //     },
        //     configuration: JSON.stringify({
        //         Version: 1.0,
        //         CrawlerOutput: {
        //             Tables: { AddOrUpdateBehavior: 'MergeNewColumns' },
        //         },
        //     }),
        // });

    }



    private addDataLakeProcessingLambda(bucket: Bucket, lakeStage: string) {

        // Define the Lambda function
        const lambdaFunction = new lambda.Function(this, `RecommendationLambda_${lakeStage}`, {
            functionName: `recommendation_Lambda_${lakeStage}`,
            runtime: lambda.Runtime.NODEJS_18_X,
            memorySize: 2048,
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







    }
}