// src/lambda/inference-lambda.ts
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { Pinecone } from '@pinecone-database/pinecone';

const PINECONE_INDEX_NAME = 'menu-search';
const MODEL_NAME = 'multilingual-e5-large';



export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    try {
        console.log("process.env.PINECONE_API_KEY",process.env.PINECONE_API_KEY)
        const limit = parseInt(event.queryStringParameters?.limit || '5', 10);

        const pc = new Pinecone({
            apiKey: process.env.PINECONE_API_KEY!,
        });

        const index = pc.Index(PINECONE_INDEX_NAME);

        const query = (event.queryStringParameters?.search || '').replace(/,/g, ' ');

        // Create the query vector using Pinecone
        const embedResponse = await pc.inference.embed(
             MODEL_NAME,
             [query],{
                inputType: "query",
                truncate: "END"
            });
        //console.log("embedResponse",embedResponse)


        const xq = embedResponse.data[0].values || [];
        if (!Array.isArray(xq)) {
            throw new Error('Failed to generate embedding');
        }

        // Query Pinecone
        const queryResponse = await index.query({
            vector: xq,
            topK: limit,
            includeMetadata: true,
        });
        console.log("queryResponse",queryResponse)

        return {
            statusCode: 200,
            body: JSON.stringify(queryResponse.matches),
            headers: {
                "Access-Control-Allow-Origin": "*", // Or your specific origin
                "Access-Control-Allow-Credentials": true,
                'Content-Type': 'application/json'
            }
        };
    } catch (error) {
        console.error('Error:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Internal Server Error' }),
            headers: {
                "Access-Control-Allow-Origin": "*", // Or your specific origin
                "Access-Control-Allow-Credentials": true,
                'Content-Type': 'application/json'
            }
        };
    }
};