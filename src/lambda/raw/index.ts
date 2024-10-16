import {S3Handler} from 'aws-lambda';
import * as AWS from 'aws-sdk';
import * as XLSX from 'xlsx';

const s3 = new AWS.S3();


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

            if (key.includes('rating')) {
                let csvFileName: string | null = "ratings.csv"
                let csvData = formatMealCustomerRatings(data.Body.toString());
                await savefileToS3(bucket, csvFileName, csvData);
            } else if (key.includes('choice')) {
                let csvFileName: string | null = "ratings_choice.csv"
                let csvData = formatUserChoices(data.Body.toString());
                await savefileToS3(bucket, csvFileName, csvData);
            } else if (key.includes('users')) {
                let csvFileName: string | null = "users.csv"
                let csvData = formatUsers(data.Body.toString());
                await savefileToS3(bucket, csvFileName, csvData);
            } else if (key.includes('xlsx')) {
                const workbook = XLSX.read(data.Body as Buffer, {type: 'buffer'});

                const sheets = ['menus'];
                const csvFiles = ['menus.csv'];
                //const sheets = ['menus', 'users', 'user_choices', 'user_ingredient_preferences', 'meal_customer ratings'];
                //const csvFiles = ['menus.csv', 'users.csv', 'user_choices.csv', 'user_ingredient_preferences.csv', 'user_rating.csv'];


                for (let i = 0; i < sheets.length; i++) {
                    const sheetName = sheets[i];
                    let csvFileName: string | null = csvFiles[i];


                    if (workbook.SheetNames.includes(sheetName)) {
                        const worksheet = workbook.Sheets[sheetName];
                        let csvData: string | null = null;

                        switch (sheetName) {
                            case 'menus':
                                const result = formatMenus(worksheet);
                                csvData = result.csvData;
                                break;
                            default:
                                console.log(`No formatting function for sheet: ${sheetName}`);
                                csvFileName = null
                                continue;
                        }
                        if (csvFileName && csvData) {

                            await savefileToS3(bucket, csvFileName, csvData);
                        }
                    } else {
                        console.log(`Sheet ${sheetName} not found in the Excel file.`);
                    }
                }
            }


        } catch (error) {
            console.error('Error processing file:', error);
        }
    }
};

// Function to format the "menus" sheet
function formatMenus(worksheet: XLSX.WorkSheet): { csvData: string } {
    const jsonData: Array<Record<string, any>> = XLSX.utils.sheet_to_json(worksheet, {header: 1, raw: false});
    const firstHeaderRow = jsonData[0] as string[];
    const secondHeaderRow = jsonData[1] as string[];

    const finalHeaders: string[] = [];
    let index = 0;
    let found = true;

    while (found && index < firstHeaderRow.length) {
        const header1 = firstHeaderRow[index]?.trim();
        const header2 = secondHeaderRow[index]?.trim();

        if (header2) {
            finalHeaders.push(header2);
        } else if (header1) {
            finalHeaders.push(header1);
        } else {
            found = false;
        }
        index++;
    }

    const headersToKeep: Record<string, string> = {
        "Menu ID": "menu_id",
        "Menu Start Date": "CREATION_TIMESTAMP",
        "Item Id": "ITEM_ID",
        "Meal Id": "meal_id",
        "Meal(En)": "Meal",
        "Ingredients(En)": "Ingredients",
        "Allergens Contains(En)": "AllergensContains",
        "Allergens May Contains(En)": "AllergensMayContains",
        "Spicy": "Spicy",
        "gluten_free": "gluten_free"
    };

    const indicesToKeep = Object.keys(headersToKeep).map(header => finalHeaders.indexOf(header)).filter(index => index !== -1);
    const dateColumns = ["Menu Start Date"];
    const dateIndices = indicesToKeep.map((index, i) => dateColumns.includes(finalHeaders[index]) ? i : -1).filter(index => index !== -1);

    const itemIdIndex = finalHeaders.indexOf("Item Id");
    const mealNameIndex = finalHeaders.indexOf("Meal(En)");

    console.log("formatMenus headerRow", headersToKeep)


    const mealMap = new Map<string, any[]>();

    const processedData = jsonData.reduce((acc: any[][], row, rowIndex) => {
        if (rowIndex === 1) return acc;

        if (rowIndex === 0) {
            const newHeader = indicesToKeep.map(index => headersToKeep[finalHeaders[index] as keyof typeof headersToKeep]);
            newHeader.push("otherItemIds")
            acc.push(newHeader);
        } else {
            const itemId = row[itemIdIndex];
            const mealName = row[mealNameIndex];

            const existingMenu = mealMap.get(mealName)

            if (!existingMenu) {
                const filteredRow = indicesToKeep.map(index => row[index]);
                filteredRow.push(itemId)
                const line = convertDatesToUnix(filteredRow, dateIndices)
                mealMap.set(mealName, line);
                acc.push(line);
            } else {
                const itemIds = existingMenu.pop()
                existingMenu.push(itemIds + "|" + itemId)
            }
        }
        return acc;
    }, []);

    const csvData = processedData.map(row => row.join('\t')).join('\n');

    return {csvData};
}


function formatUsers(fileContent: string): string {
    const preprocessCSV = (fileContent: string): string => {
        return fileContent.replace(/"[^"]*"/g, (match) => {
            return match.replace(/,/g, '');
        });
    };

    const preprocessedContent = preprocessCSV(fileContent);
    const rows = preprocessedContent.split('\n');



    // Define the headers you want to keep
    const headersToKeep = [
        'user_id',
        'deleted_at',
        'shipping_city',
        'shipping_state',
        'grandpa',
        'subscribed',
        'locale',
        'last_login_at',
        'created_at',
        'subscribed_at'
    ];

    // Extract the header row and find the indices of the columns to keep
    const headerRow = rows[0].split(',');
    const indicesToKeep = headersToKeep.map(header => headerRow.indexOf(header)).filter(index => index !== -1);
    console.log("formatUsers headerRow", headerRow)
    console.log("indicesToKeep", indicesToKeep)
    // Find indices of date columns to convert
    const dateColumns = ['last_login_at', 'created_at', 'subscribed_at'];
    const dateIndices = dateColumns.map(header => headersToKeep.indexOf(header)).filter(index => index !== -1);
    //console.log("dateIndices for dateIndices", dateIndices)


    // Filter the data to keep only the desired columns and convert dates
    const processedData = rows.map((line, rowIndex) => {
        const row = line.split(',');
        if (rowIndex === 0)
            return indicesToKeep.map(index => row[index]); // Return header row as is

        const filteredRow = indicesToKeep.map(index => row[index]);

        return convertDatesToUnix(filteredRow, dateIndices);
    });

    // Convert the filtered data back to a CSV string
    const csvData = processedData.map(row => row.join('\t')).join('\n');

    return csvData;
}


function formatMealCustomerRatings(fileContent: string): string {
    const rows = fileContent.split('\r\n');
    const headerRow = rows[0].split(',');

    // Find indices of required columns
    const userIdIndex = headerRow.indexOf("user_id");
    const menuItemIdIndex = headerRow.indexOf("menu_item_id");
    const ratingIndex = headerRow.indexOf("rating");
    const dateIndex = headerRow.indexOf("date");


    if (userIdIndex === -1 || menuItemIdIndex === -1 || ratingIndex === -1 || dateIndex === -1) {
        throw new Error('formatMealCustomerRatings One or more required columns were not found in the worksheet.');
    }

    // Create new header row
    const newHeader: string[] = ["USER_ID", "ITEM_ID", "EVENT_TYPE", "EVENT_VALUE", "TIMESTAMP", "LIKED"];

    // Process the data rows
    const processedData = rows.slice(1).map(line => {
        const row = line.split(',');

        const itemId = row[menuItemIdIndex];
        const rating = parseInt(row[ratingIndex])

        if(!itemId)
            return []

        return [
            row[userIdIndex],
            itemId,
            "Watch",
            (rating * 20).toString(), /* convert the rating from 0 to 100*/
            dateStrToUnix(row[dateIndex]),
            rating > 3 ? 1 : 0
        ];
    });

    const csvData = [newHeader, ...processedData].map(row => row.join(',')).join('\n');
    return csvData
}

// Function to format the "user_choices" sheet
function formatUserChoices(fileContent: string): string {
    const rows = fileContent.split('\n');
    const headerRow = rows[0].split(',');

    // Find indices of required columns
    const userIdIndex = headerRow.indexOf("user_id");
    const menuItemIdIndex = headerRow.indexOf("menu_item_id");
    const manualIndex = headerRow.indexOf("manual");
    const createdAtIndex = headerRow.indexOf("created_at");

    if (userIdIndex === -1 || menuItemIdIndex === -1 || manualIndex === -1 || createdAtIndex === -1) {
        throw new Error('One or more required columns were not found in the worksheet.');
    }

    // Create new header row
    const newHeader: string[] = ["USER_ID", "ITEM_ID", "EVENT_TYPE", "EVENT_VALUE", "TIMESTAMP", "LIKED"];

    const parsedRows = rows.slice(1).map(line => line.split(',')) // split each line

    // Process the data rows
    const processedData = parsedRows
        .filter( row => {
            return row[manualIndex] === 'true'
        })
        .map(row => {
            const itemId = row[menuItemIdIndex];
            return [
                row[userIdIndex],
                itemId,
                "Click",
                "1",
                dateStrToUnix(row[createdAtIndex]),
                1
            ];
        });

    // Combine header and processed data

    const csvData = [newHeader, ...processedData].map(row => row.join(',')).join('\n');
    return csvData
}

function formatUserIngredientsPreference(worksheet: XLSX.WorkSheet): string {
    // Convert the worksheet to JSON to easily manipulate the data
    const jsonData: any[][] = XLSX.utils.sheet_to_json(worksheet, {header: 1, raw: false});

    // Process the data rows using map
    const processedData = jsonData.map(row => row.join('\t'));

    // Join the processed rows back into a single CSV string with tabs as separators
    const csvData = processedData.join('\n');
    return csvData;
}

function convertDatesToUnix(row: any[], dateIndices: number[]): any[] {
    return row.map((value, index) => {
        if (dateIndices.includes(index) && value) {
            if (typeof value === 'number') {
                return excelDateToUnix(value); // Convert Excel date serial number to Unix timestamp
            }
            return new Date(value).getTime() / 1000; // Convert to Unix timestamp (seconds)
        }
        return value;
    });
}

function excelDateToUnix(excelDate: number): number {
    const excelEpoch = new Date(Date.UTC(1899, 11, 30)); // Excel's epoch is December 30, 1899
    const millisecondsPerDay = 24 * 60 * 60 * 1000;
    const date = new Date(excelEpoch.getTime() + excelDate * millisecondsPerDay);
    return Math.floor(date.getTime() / 1000); // Convert to Unix timestamp in seconds
}

function dateStrToUnix(dateStr: string): number {
    const date = new Date(dateStr);
    return Math.floor(date.getTime() / 1000); // Convert to Unix timestamp in seconds
}

async function savefileToS3(bucket: string, csvFileName: string, csvData: string) {
    const uploadParams = {
        Bucket: bucket,
        Key: `data/formated/${csvFileName}`,
        Body: csvData,
        ContentType: 'text/csv',
    };
    await s3.putObject(uploadParams).promise();
    console.log(`Uploaded ${csvFileName} to ${bucket}/data/formated`);
}