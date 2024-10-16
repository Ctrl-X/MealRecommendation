import {DynamoDB} from 'aws-sdk';

const dynamoDB = new DynamoDB.DocumentClient();

const INTERACTIONS_TABLE_NAME = 'interactions';
const MENUS_TABLE_NAME = 'menus';

const BATCH_SIZE = 25; // DynamoDB allows a maximum of 25 items per batch write

export async function saveData(fileContent: string): Promise<void> {
    // Load all menus from the menus table
    const menus = await loadMenus();

    const lines = fileContent.split('\n');
    const headers = lines[0].split(',');

    let batchItems: DynamoDB.DocumentClient.WriteRequests = [];
    const uniqueInteractions = new Map<string, any>();

    for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line) {
            const values = line.split(',');
            const originalItemId = values[1];

            // Find the corresponding menu item_id
            const menuItemId = findMenuItemId(menus, originalItemId);

            if (menuItemId) {
                const interaction = {
                    item_id: menuItemId,
                    user_id: values[0],
                    event_type: values[2],
                    event_value: parseFloat(values[3]),
                    created_at: parseInt(values[4], 10),
                    liked: values[5] === '1' ? 1 : 0
                };
                // Create a unique key for this interaction
                const uniqueKey = `${interaction.user_id}:${interaction.item_id}`;

                // If this key doesn't exist or the current interaction is newer, update it
                if (!uniqueInteractions.has(uniqueKey) ||
                    interaction.created_at > uniqueInteractions.get(uniqueKey).created_at) {
                    uniqueInteractions.set(uniqueKey, interaction);
                }
            }
        }
    }
    // Convert the unique interactions map to an array of batch write requests
    for (const interaction of uniqueInteractions.values()) {
        batchItems.push({
            PutRequest: {
                Item: interaction
            }
        });

        // If we've reached the batch size, write the batch
        if (batchItems.length === BATCH_SIZE) {
            await batchWriteItems(batchItems);
            batchItems = []; // Clear the batch
        }
    }


    // Write any remaining items
    if (batchItems.length > 0) {
        await batchWriteItems(batchItems);
    }
}

async function loadMenus(): Promise<any[]> {
    let lastEvaluatedKey: DynamoDB.DocumentClient.Key | undefined;
    let menus: any[] = []
    do {
        const params: DynamoDB.DocumentClient.ScanInput = {
            TableName: 'menus',
            ExclusiveStartKey: lastEvaluatedKey
        };

        const result = await dynamoDB.scan(params).promise();

        menus = menus.concat(result.Items || [])

        lastEvaluatedKey = result.LastEvaluatedKey;
    } while (lastEvaluatedKey);

    return menus

    return [];
}

function findMenuItemId(menus: any[], itemId: string): string | null {
    for (const menu of menus) {
        if (menu.item_id === itemId) {
            return menu.item_id;
        }
        if (menu.other_ids && menu.other_ids.split('|').includes(itemId)) {
            return menu.item_id;
        }
    }
    return null;
}

async function batchWriteItems(items: DynamoDB.DocumentClient.WriteRequests): Promise<void> {
    const params: DynamoDB.DocumentClient.BatchWriteItemInput = {
        RequestItems: {
            [INTERACTIONS_TABLE_NAME]: items
        }
    };

    try {
        await dynamoDB.batchWrite(params).promise();
        console.log(`Successfully wrote ${items.length} items`);
    } catch (error) {
        console.error('Error batch writing items:', error);
        // Here you might want to implement a retry mechanism or handle unprocessed items
    }
}