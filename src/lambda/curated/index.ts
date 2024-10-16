import {S3Handler} from 'aws-lambda';
import {S3} from 'aws-sdk';
import * as menus from './menus';
import * as users from './users';
import * as ratings from './ratings';

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

            const data = await s3.getObject(params).promise();

            if (!data.Body) {
                console.log('No data found in the file.');
                continue;
            }

            if (key.includes('menus.csv')) {
                await menus.saveData(data.Body.toString());
            } else if (key.includes('users.csv')) {
                await users.saveData(data.Body.toString());
            } else if (key.includes('rating')) {
                await ratings.saveData(data.Body.toString());
            } else {
                console.log(`Unsupported file: ${key}`);
                continue;
            }

        } catch (error) {
            console.error('Error processing file:', error);
        }
    }
};