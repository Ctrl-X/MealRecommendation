import { DynamoDB } from 'aws-sdk';

const dynamoDB = new DynamoDB.DocumentClient();

export async function saveData(fileContent: string): Promise<void> {
    const lines = fileContent.split('\n');
    const headers = lines[0].split(',');

    for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line) {
            const values = line.split(',');
            const name = values[3]
            const genres = values[4]
            const genre_l2 = values[5]
            const genre_l3 = values[6]
            const description = values[7].split("|")
            console.log("meun" + name,description)
            const menu = {
                item_id: values[0],
                //price: parseFloat(values[1]),
                created_at: parseInt(values[2], 10),
                name,
                genres,
                genre_l2,
                genre_l3,
                product_description: description.join(","),
                content_classification: values[8],
                other_ids: values[9]
            };

            const params = {
                TableName: 'menus',
                Item: menu,
                ConditionExpression: 'attribute_not_exists(item_id)'
            };

            try {
                // Process ingredients
                const ingredients = description;
                ingredients.push(genres,
                    genre_l2,
                    genre_l3)
                await processIngredients(ingredients);

                await dynamoDB.put(params).promise();
                console.log(`Menu item ${menu.item_id} upserted successfully`);


            } catch (error) {
                if (error instanceof Error) {
                    if ((error as any).code === 'ConditionalCheckFailedException') {
                        console.log(`Menu item ${menu.item_id} already exists, skipping`);
                    } else {
                        console.error(`Error inserting menu item ${menu.item_id}:`, error.message);
                    }
                } else {
                    console.error(`Unknown error inserting menu item ${menu.item_id}:`, error);
                }
            }
        }
    }
}

async function processIngredients(ingredients: string[]) {
    for (const ingredient of ingredients) {
        const trimmedIngredient = ingredient.trim();
        if (trimmedIngredient) {
            const params = {
                TableName: 'ingredients',
                Key: { name: trimmedIngredient },
                UpdateExpression: 'SET #count = if_not_exists(#count, :zero) + :increment',
                ExpressionAttributeNames: { '#count': 'count' },
                ExpressionAttributeValues: { ':zero': 0, ':increment': 1 },
                ReturnValues: 'UPDATED_NEW'
            };

            try {
                await dynamoDB.update(params).promise();
                console.log(`Ingredient ${trimmedIngredient} updated successfully`);
            } catch (error) {
                console.error(`Error updating ingredient ${trimmedIngredient}:`, error);
            }
        }
    }
}