import {APIGatewayProxyEvent, APIGatewayProxyResult} from 'aws-lambda';
import {DynamoDB, PersonalizeRuntime} from 'aws-sdk';
import * as cdk from "aws-cdk-lib";
import callBedrock, { generateImageWithTitan } from "./utils/bedrockUtils";

const dynamodb = new DynamoDB.DocumentClient();
const personalizeRuntime = new PersonalizeRuntime();

const PERSONALIZE_REGION = process.env.AWS_REGION || 'us-east-1';
const ACCOUNT_ID = process.env.ACCOUNT_ID || '';

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    const params = event.queryStringParameters || {};
    const typeParam = params.type;
    const itemIds = params.item_id ? params.item_id.split(',') : undefined;
    const userId = params.user_id;

    try {
        if (!typeParam) {
            return await getMenusFromDynamoDB(itemIds);
        } else if (typeParam === 'ingredients') {
            return await getIngredientsFromDynamoDB();
        } else if (typeParam === 'creator') {
            const ingredients = params.ingredients ? params.ingredients.split(',') : undefined;
            return await createMenuFromBedrock(ingredients);
        } else if (typeParam === 'picks') {
            return await getPersonalizeRecommendations(userId, 'best-for-you');
        } else if (typeParam === 'popular') {
            return await getPersonalizeRecommendations(userId, 'most-popular');
        }  else if (typeParam === 'image') {
            const description = params.description;
            if (!description) {
                return {
                    statusCode: 400,
                    body: JSON.stringify({ error: 'Description is required for image generation' })
                };
            }
            return await generateImage(description);
        } else {
            return {
                statusCode: 400,
                body: JSON.stringify({error: 'Invalid type parameter'})
            };
        }
    } catch (error) {
        console.error('Error:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({error: 'Internal server error'}),
            headers: {
                "Access-Control-Allow-Origin": "*", // Or your specific origin
                "Access-Control-Allow-Credentials": true,
                'Content-Type': 'application/json'
            }
        };
    }
};

async function getMenusFromDynamoDB(itemIds: string[] | undefined): Promise<APIGatewayProxyResult> {

    if (itemIds && itemIds.length > 0) {
        let params: DynamoDB.DocumentClient.BatchGetItemInput;
        // If itemIds are provided, use BatchGetItem operation
        params = {
            RequestItems: {
                'menus': {
                    Keys: itemIds.map(id => ({item_id: id}))
                }
            }
        };

        try {
            const result = await dynamodb.batchGet(params).promise();
            const menus = result.Responses?.['menus'] || [];

            return {
                statusCode: 200,
                body: JSON.stringify(menus),
                headers: {
                    "Access-Control-Allow-Origin": "*", // Or your specific origin
                    "Access-Control-Allow-Credentials": true,
                    'Content-Type': 'application/json'
                }
            };
        } catch (error) {
            console.error('Error fetching menus from DynamoDB:', error);
            return {
                statusCode: 500,
                body: JSON.stringify({error: 'Failed to retrieve menus'}),
                headers: {
                    "Access-Control-Allow-Origin": "*", // Or your specific origin
                    "Access-Control-Allow-Credentials": true,
                    'Content-Type': 'application/json'
                }
            };
        }
    } else {
        const tableName = 'menus';
        let allMenus: any[] = [];
        let lastEvaluatedKey: DynamoDB.DocumentClient.Key | undefined;

        do {
            let scanParams: DynamoDB.DocumentClient.ScanInput = {
                TableName: tableName,
                Limit: 1000 // Adjust this value based on your needs
            };

            if (lastEvaluatedKey) {
                scanParams.ExclusiveStartKey = lastEvaluatedKey;
            }

            try {
                const result = await dynamodb.scan(scanParams).promise();

                if (result.Items) {
                    allMenus = allMenus.concat(result.Items);
                }

                lastEvaluatedKey = result.LastEvaluatedKey;
            } catch (error) {
                console.error('Error scanning DynamoDB:', error);
                return {
                    statusCode: 500,
                    body: JSON.stringify({error: 'Failed to retrieve ingredients'}),
                    headers: {
                        "Access-Control-Allow-Origin": "*",
                        "Access-Control-Allow-Credentials": true,
                        'Content-Type': 'application/json'
                    }
                };
            }
        } while (lastEvaluatedKey);

        return {
            statusCode: 200,
            body: JSON.stringify(allMenus),
            headers: {
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Credentials": true,
                'Content-Type': 'application/json'
            }
        };
    }
}

async function getIngredientsFromDynamoDB(): Promise<APIGatewayProxyResult> {
    const tableName = 'ingredients';
    let allIngredients: any[] = [];
    let lastEvaluatedKey: DynamoDB.DocumentClient.Key | undefined;

    do {
        let scanParams: DynamoDB.DocumentClient.ScanInput = {
            TableName: tableName,
            Limit: 1000 // Adjust this value based on your needs
        };

        if (lastEvaluatedKey) {
            scanParams.ExclusiveStartKey = lastEvaluatedKey;
        }

        try {
            const result = await dynamodb.scan(scanParams).promise();

            if (result.Items) {
                allIngredients = allIngredients.concat(result.Items);
            }

            lastEvaluatedKey = result.LastEvaluatedKey;
        } catch (error) {
            console.error('Error scanning DynamoDB:', error);
            return {
                statusCode: 500,
                body: JSON.stringify({error: 'Failed to retrieve ingredients'}),
                headers: {
                    "Access-Control-Allow-Origin": "*",
                    "Access-Control-Allow-Credentials": true,
                    'Content-Type': 'application/json'
                }
            };
        }
    } while (lastEvaluatedKey);

    return {
        statusCode: 200,
        body: JSON.stringify(allIngredients),
        headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Credentials": true,
            'Content-Type': 'application/json'
        }
    };
}


async function createMenuFromBedrock(ingredients: string[] | undefined): Promise<any> {
    if (!ingredients || ingredients.length === 0) {
        throw new Error("No ingredients provided");
    }

    // Prepare the prompt for Bedrock
    const prompt = `Create 3 different menus using the provided ingredients. 
    Provide the menu in JSON format with the following structure:
    [
    {
        "name": "Menu Name",
        "description": "Brief description of the menu",
        "ingredients": ["ingredient1", "ingredient2", ...]
    },
    ...
    ]. You don't have to use every ingredients provided. Skip preambule and only give a valid JSON in your response. Here are the ingredient list :`;

    // Invoke Bedrock model
    try {
        const menuData = await callBedrock(prompt, ingredients.join(", "), 0.7);
        return {
            statusCode: 200,
            body: JSON.stringify(menuData),
            headers: {
                "Access-Control-Allow-Origin": "*", // Or your specific origin
                "Access-Control-Allow-Credentials": true,
                'Content-Type': 'application/json'
            }
        };
    } catch (error) {
        console.error("Error creating menu:", error);
        throw error;
    }
}


async function getPersonalizeRecommendations(userId: string | undefined, recommenderName: string): Promise<APIGatewayProxyResult> {
    if (!userId) {
        return {
            statusCode: 400,
            body: JSON.stringify({error: 'user_id is required for personalized recommendations'}),
            headers: {
                "Access-Control-Allow-Origin": "*", // Or your specific origin
                "Access-Control-Allow-Credentials": true,
                'Content-Type': 'application/json'
            }
        };
    }


    const params: PersonalizeRuntime.GetRecommendationsRequest = {
        recommenderArn: `arn:aws:personalize:${PERSONALIZE_REGION}:${ACCOUNT_ID}:recommender/${recommenderName}`,
        userId: userId,
        numResults: 5
    };

    const result = await personalizeRuntime.getRecommendations(params).promise();
    const recommendations = result.itemList || [];

    return {
        statusCode: 200,
        body: JSON.stringify(recommendations),
        headers: {
            "Access-Control-Allow-Origin": "*", // Or your specific origin
            "Access-Control-Allow-Credentials": true,
            'Content-Type': 'application/json'
        }
    };
}

async function generateImage(description: string): Promise<APIGatewayProxyResult> {
    try {
        const imageBase64 = await generateImageWithTitan(description);
        return {
            statusCode: 200,
            body: JSON.stringify({ image: imageBase64 }),
            headers: {
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Credentials": true,
                'Content-Type': 'application/json'
            }
        };
    } catch (error) {
        console.error('Error generating image:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Failed to generate image' }),
            headers: {
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Credentials": true,
                'Content-Type': 'application/json'
            }
        };
    }
}