import {DynamoDB} from 'aws-sdk';

const dynamoDB = new DynamoDB.DocumentClient();

export async function saveData(fileContent: string): Promise<void> {
    const lines = fileContent.split('\n');
    const headers = lines[0].split(',');

    // First, delete all existing items
    // await deleteAllItems('users');

    console.log("user counts", lines.length)
    // Deduplicate lines based on user_id (first column)
    const uniqueLines = new Map<string, string>();
    for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line) {
            const userId = line.split(',')[0];
            uniqueLines.set(userId, line);
        }
    }

    const deduplicatedLines = Array.from(uniqueLines.values());
    const batchSize = 25; // DynamoDB BatchWrite limit is 25 items per request
    console.log("unique user counts", deduplicatedLines.length)
    let totalInserted = 0;

    for (let i = 0; i < deduplicatedLines.length; i += batchSize) {
        const batch = deduplicatedLines.slice(i, i + batchSize);
        const putRequests = batch.map(line => {
            const values = line.split(',');
            const created_at = parseInt(values[5], 10)
            if( isNaN(created_at)){
                console.log("created_at is NaN - values[5]", values[5])
            }
            return {
                PutRequest: {
                    Item: {
                        user_id: values[0],
                        shipping_city: values[2],
                        shipping_state: values[3],
                        locale: values[4],
                        created_at,
                    }
                }
            };
        });

        const params: DynamoDB.DocumentClient.BatchWriteItemInput = {
            RequestItems: {
                'users': putRequests
            }
        };

        try {
            await batchWriteWithRetry(params);
            totalInserted += putRequests.length;
            // Log only when 1000 or more users have been inserted
            if (totalInserted >= 1000) {
                console.log(`${totalInserted} users inserted successfully`);
                totalInserted = 0; // Reset the counter
            }
        } catch (error) {
            console.error('Error in batch write:', error);
        }
    }
}

async function batchWriteWithRetry(params: DynamoDB.DocumentClient.BatchWriteItemInput, retries = 3): Promise<void> {
    try {
        const result = await dynamoDB.batchWrite(params).promise();
        if (result.UnprocessedItems && Object.keys(result.UnprocessedItems).length > 0) {
            if (retries > 0) {
                await batchWriteWithRetry({RequestItems: result.UnprocessedItems}, retries - 1);
            } else {
                console.error('Failed to process all items after retries');
            }
        }
    } catch (error) {
        if (retries > 0) {
            await batchWriteWithRetry(params, retries - 1);
        } else {
            throw error;
        }
    }
}


async function deleteAllItems(tableName: string): Promise<void> {
    const scanParams: DynamoDB.DocumentClient.ScanInput = {
        TableName: tableName,
        ProjectionExpression: 'user_id'
    };

    let lastEvaluatedKey: DynamoDB.DocumentClient.Key | undefined;
    let deletedCount = 0
    do {
        if (lastEvaluatedKey) {
            scanParams.ExclusiveStartKey = lastEvaluatedKey;
        }
        const scanResult = await dynamoDB.scan(scanParams).promise();

        if (scanResult.Items && scanResult.Items.length > 0) {
            const deleteRequests = scanResult.Items.map(item => ({
                DeleteRequest: {Key: {user_id: item.user_id}}
            }));

            for (let i = 0; i < deleteRequests.length; i += 25) {
                const batch = deleteRequests.slice(i, i + 25);
                await dynamoDB.batchWrite({
                    RequestItems: {
                        [tableName]: batch
                    }
                }).promise();
                deletedCount+=25
            }
        }

        lastEvaluatedKey = scanResult.LastEvaluatedKey;
    } while (lastEvaluatedKey);

    console.log(`All items deleted from ${tableName}`, deletedCount);
}