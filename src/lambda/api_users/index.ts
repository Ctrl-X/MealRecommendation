// src/lambda/api_users_lambda.ts

import {APIGatewayProxyEvent, APIGatewayProxyResult} from 'aws-lambda';
import {DynamoDB} from 'aws-sdk';

const dynamoDB = new DynamoDB.DocumentClient();
const USERS_TABLE_NAME = process.env.USERS_TABLE_NAME || 'users';
const INTERACTIONS_TABLE_NAME = 'interactions';

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    try {
        const type = event.queryStringParameters?.type;
        const userId = event.queryStringParameters?.user_id;
        const isCounting = event.queryStringParameters?.isCounting === '1';

        if (type === 'interactions' && userId) {
            return await getUserInteractions(userId);
        } else {
            return await getUsersList(event, isCounting);
        }
    } catch (error) {
        console.error('Error:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({error: 'Internal Server Error'}),
            headers: {
                'Content-Type': 'application/json',
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Credentials": true,
            }
        };
    }
};

async function getUsersList(event: APIGatewayProxyEvent, isCounting: boolean): Promise<APIGatewayProxyResult> {
    const offset = parseInt(event.queryStringParameters?.offset || '0', 10);
    const limit = parseInt(event.queryStringParameters?.limit || '100', 10);
    const itemIds = event.queryStringParameters?.itemIds ? event.queryStringParameters.itemIds.split(',') : [];

    let body = ""
    if (itemIds.length === 0) {
        // If no itemIds provided
        if (isCounting) {
            // Count all users
            let totalCount = 0;
            let lastEvaluatedKey: DynamoDB.DocumentClient.Key | undefined;
            do {
                const params: DynamoDB.DocumentClient.ScanInput = {
                    TableName: USERS_TABLE_NAME,
                    Select: 'COUNT',
                    ExclusiveStartKey: lastEvaluatedKey
                };

                const result = await dynamoDB.scan(params).promise();
                totalCount += result.Count || 0;
                lastEvaluatedKey = result.LastEvaluatedKey;
            } while (lastEvaluatedKey);


            body = JSON.stringify({count: totalCount});
        } else {
            // return the whole user list
            const params: DynamoDB.DocumentClient.ScanInput = {
                TableName: USERS_TABLE_NAME,
                Limit: limit,
                ExclusiveStartKey: offset > 0 ? {user_id: offset.toString()} : undefined
            };

            const result = await dynamoDB.scan(params).promise();
            body = JSON.stringify({
                users: result.Items,
                lastEvaluatedKey: result.LastEvaluatedKey
            })
        }
    } else {
        // If itemIds provided, fetch users with interactions
        const userIds = new Set<string>();

        // Use Query operation instead of BatchGetItem
        for (const itemId of itemIds) {
            const params: DynamoDB.DocumentClient.QueryInput = {
                TableName: INTERACTIONS_TABLE_NAME,
                KeyConditionExpression: 'item_id = :itemId',
                ExpressionAttributeValues: {
                    ':itemId': itemId
                }
            };

            const result = await dynamoDB.query(params).promise();
            result.Items?.filter(item => item.liked).forEach(item => userIds.add(item.user_id));
        }

        if (userIds.size === 0) {
            body = JSON.stringify({users: [], lastEvaluatedKey: null})
        } else {
            if (isCounting) {
                body = JSON.stringify({count: userIds.size});

            } else {
                const userParams: DynamoDB.DocumentClient.BatchGetItemInput = {
                    RequestItems: {
                        [USERS_TABLE_NAME]: {
                            Keys: Array.from(userIds).map(id => ({user_id: id}))
                        }
                    }
                };
                const usersResult = await dynamoDB.batchGet(userParams).promise();
                const users = usersResult.Responses?.[USERS_TABLE_NAME] || [];
                body = JSON.stringify({
                    users: users,
                    lastEvaluatedKey: null // Since we're fetching all matching users, there's no pagination
                })
            }
        }
    }
    return {
        statusCode: 200,
        body,
        headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Credentials": true,
            'Content-Type': 'application/json'
        }
    };
}


async function getUserInteractions(userId: string): Promise<APIGatewayProxyResult> {
    const params: DynamoDB.DocumentClient.QueryInput = {
        TableName: INTERACTIONS_TABLE_NAME,
        IndexName: 'user_id_index',
        KeyConditionExpression: 'user_id = :userId',
        ExpressionAttributeValues: {
            ':userId': userId
        },
        ScanIndexForward: false, // This will sort in descending order
        Limit: 5
    };

    const result = await dynamoDB.query(params).promise();

    return {
        statusCode: 200,
        body: JSON.stringify({
            interactions: result.Items
        }),
        headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Credentials": true,
            'Content-Type': 'application/json'
        }
    };
}