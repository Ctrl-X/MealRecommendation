import { S3Handler } from 'aws-lambda';
import { S3 } from 'aws-sdk';
import * as menus from './menus';
import * as users from './users';

const s3 = new S3();

export const handler: S3Handler = async (event) => {
    console.log('Event:', JSON.stringify(event, null, 2));
    for (const record of event.Records) {
        const bucket = record.s3.bucket.name;
        const key = decodeURIComponent(record.s3.object.key.replace(/\+/g, ' '));
        console.log(`Processing file: ${key} from bucket: ${bucket}`);
        try {
            const params = {
                Bucket: bucket,
                Key: key,
            };
            let destFilename = ""

            const data = await s3.getObject(params).promise();

            if (!data.Body) {
                console.log('No data found in the file.');
                continue;
            }

            let csvData;
            if (key.includes('menus.csv')) {
                csvData = await menus.curatingData(data.Body.toString());
                destFilename = "menus.csv"
            } else if (key.includes('users.csv')) {
                csvData = users.curatingData(data.Body.toString());
                destFilename = "users.csv"
            } else {
                console.log(`Unsupported file: ${key}`);
                continue;
            }

            const uploadParams = {
                Bucket: bucket,
                Key: `data/curated/${destFilename}`,
                Body: csvData,
                ContentType: 'text/csv',
            };
            await s3.putObject(uploadParams).promise();

        } catch (error) {
            console.error('Error processing file:', error);
        }
    }
};