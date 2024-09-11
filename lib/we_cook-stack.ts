import * as cdk from 'aws-cdk-lib';
import {Construct} from 'constructs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as s3n from 'aws-cdk-lib/aws-s3-notifications';
import * as path from 'path';
import * as fs from 'fs';
import {Bucket} from "aws-cdk-lib/aws-s3";


export class WeCookStack extends cdk.Stack {
    constructor(scope: Construct, id: string, props?: cdk.StackProps) {
        super(scope, id, props);

        // Define the bucket name with account ID
        const accountId = cdk.Stack.of(this).account;
        const bucketName = `meal-recommendation-${accountId}`;

        // Create  the S3 bucket to hold CSV files
        const bucket = new s3.Bucket(this, 'MealRecommendationBucket', {
            bucketName: bucketName,
            removalPolicy: cdk.RemovalPolicy.RETAIN,
            autoDeleteObjects: false,
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

        this.addDataLakeProcessingLambda('recommendation_raw_processing',  'raw',bucket);
    }



    private addDataLakeProcessingLambda(functionName: string, lakeStage: string, bucket: Bucket  ) {
        // //Deploy the source code of lambda
        // new s3deploy.BucketDeployment(this, `LambdaSourceFolder_${functionName}`, {
        //     sources: [
        //         s3deploy.Source.asset(path.join(__dirname, `../src/lambda/${lakeStage}/dist`))
        //     ],
        //     destinationBucket: bucket,
        //     destinationKeyPrefix: "code"
        // });

        // Define the Lambda function
        const lambdaFunction = new lambda.Function(this, `Lambda_${functionName}`, {
            functionName: functionName,
            runtime: lambda.Runtime.NODEJS_18_X,
            handler: 'index.handler',
            code: lambda.Code.fromAsset(path.join(__dirname, `../src/lambda/${lakeStage}/dist`)),
            environment: {
                BUCKET_NAME: bucket.bucketName,
            },
        });

        // Grant the Lambda function permissions to read from the bucket
        bucket.grantReadWrite(lambdaFunction);

        // Add an event notification for the "raw/" folder
        bucket.addEventNotification(
            s3.EventType.OBJECT_CREATED,
            new s3n.LambdaDestination(lambdaFunction),
            {prefix: `data/${lakeStage}/`}
        );
    }
}