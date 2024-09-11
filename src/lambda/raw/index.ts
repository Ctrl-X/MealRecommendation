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

            const workbook = XLSX.read(data.Body as Buffer, {type: 'buffer'});

            const sheets = ['menus', 'users', 'user_choices', 'meal_customer ratings'];
            const csvFiles = ['menus.csv', 'users.csv', 'user_choices.csv', 'user_rating.csv'];

            for (let i = 0; i < sheets.length; i++) {
                const sheetName = sheets[i];
                const csvFileName = csvFiles[i];

                if (workbook.SheetNames.includes(sheetName)) {
                    const worksheet = workbook.Sheets[sheetName];
                    let csvData: string;

                    switch (sheetName) {
                        case 'menus':
                            csvData = formatMenus(worksheet);
                            break;
                        case 'users':
                            csvData = formatUsers(worksheet);
                            break;
                        case 'meal_customer ratings':
                            csvData = formatMealCustomerRatings(worksheet);
                            break;
                        case 'user_choices':
                            csvData = formatUserChoices(worksheet);
                            break;
                        default:
                            console.log(`No formatting function for sheet: ${sheetName}`);
                            continue;
                    }

                    const uploadParams = {
                        Bucket: bucket,
                        Key: `data/formated/${csvFileName}`,
                        Body: csvData,
                        ContentType: 'text/csv',
                    };

                    await s3.putObject(uploadParams).promise();
                    console.log(`Uploaded ${csvFileName} to ${bucket}/data/formated`);
                } else {
                    console.log(`Sheet ${sheetName} not found in the Excel file.`);
                }
            }
        } catch (error) {
            console.error('Error processing file:', error);
        }
    }
};

// Function to format the "menus" sheet
function formatMenus(worksheet: XLSX.WorkSheet): string {
    // Convert the worksheet to JSON to easily manipulate the data
    const jsonData: Array<Record<string, any>> = XLSX.utils.sheet_to_json(worksheet, {header: 1, raw: false});

    // Extract the first two rows for headers
    const firstHeaderRow = jsonData[0] as string[];
    const secondHeaderRow = jsonData[1] as string[];

    // Determine final headers using a while loop
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
            found = false; // Stop if both headers are empty
        }
        index++;
    }


    console.log("finalHeaders", finalHeaders)

    // Define the headers you want to keep and their new names
    const headersToKeep: Record<string, string> = {
        "Menu ID": "menu_id",
        "Menu Start Date": "Menu Start Date",
        "Item Id": "ITEM_ID",
        "Meal Id": "meal_id",
        "Meal(En)": "Meal",
        "Food Costing per Sides in $": "FoodCost",
        "Labor Costing per Sides in $": "LaborCost",
        "Ingredients(En)": "Ingredients",
        "Allergens Contains(En)": "AllergensContains",
        "Allergens May Contains(En)": "AllergensMayContains",
        "Spicy": "Spicy",
        "gluten_free": "gluten_free"
    };

    // Find the indices of the columns to keep
    const indicesToKeep = Object.keys(headersToKeep).map(header => finalHeaders.indexOf(header)).filter(index => index !== -1);

    // Find indices of date columns to convert within the filtered columns
    const dateColumns = ["Menu Start Date"];
    const dateIndices = indicesToKeep.map((index, i) => dateColumns.includes(finalHeaders[index]) ? i : -1).filter(index => index !== -1);

    // Filter and rename the data using reduce
    const filteredData = jsonData.reduce((acc: any[][], row, rowIndex) => {
        if (rowIndex === 1) return acc; // Skip the second row

        if (rowIndex === 0) {
            acc.push(indicesToKeep.map(index => headersToKeep[finalHeaders[index] as keyof typeof headersToKeep])); // Use type assertion
        } else {
            const filteredRow = indicesToKeep.map(index => row[index]);
            acc.push(convertDatesToUnix(filteredRow, dateIndices));
        }

        return acc;
    }, []);

    // Convert the filtered data back to a CSV string
    const csvData = XLSX.utils.sheet_to_csv(XLSX.utils.aoa_to_sheet(filteredData));

    return csvData;
}


function formatUsers(worksheet: XLSX.WorkSheet): string {
    // Convert the worksheet to JSON to easily manipulate the data
    const jsonData: Array<Record<string, any>> = XLSX.utils.sheet_to_json(worksheet, {header: 1});

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
    const headerRow = jsonData[0] as string[];
    const indicesToKeep = headersToKeep.map(header => headerRow.indexOf(header)).filter(index => index !== -1);
    console.log("headerRow", headerRow)
    console.log("indicesToKeep", indicesToKeep)
    // Find indices of date columns to convert
    const dateColumns = ['last_login_at', 'created_at', 'subscribed_at'];
    const dateIndices = dateColumns.map(header => headersToKeep.indexOf(header)).filter(index => index !== -1);
    console.log("dateIndices for dateIndices", dateIndices)


    // Filter the data to keep only the desired columns and convert dates
    const filteredData = jsonData.map((row, rowIndex) => {
        if (rowIndex === 0)
            return indicesToKeep.map(index => row[index]); // Return header row as is

        const filteredRow = indicesToKeep.map(index => row[index]);
        return convertDatesToUnix(filteredRow, dateIndices);
    });

    // Convert the filtered data back to a CSV string
    const csvData = XLSX.utils.sheet_to_csv(XLSX.utils.aoa_to_sheet(filteredData));

    return csvData;
}


// Function to format the "meal_customer ratings" sheet
function formatMealCustomerRatings(worksheet: XLSX.WorkSheet): string {
    const jsonData: any[][] = XLSX.utils.sheet_to_json(worksheet, {header: 1, raw: false});
    const headerRow = jsonData[0] as string[];
    const dateColumnIndex = headerRow.indexOf("date");

    if (dateColumnIndex === -1) {
        throw new Error('The "date" column was not found in the worksheet.');
    }

    const processedData = jsonData.map((row, rowIndex) => {
        if (rowIndex === 0) {
            return row;
        } else {
            const newRow = row.slice();
            if (newRow[dateColumnIndex]) {
                newRow[dateColumnIndex] = dateStrToUnix(newRow[dateColumnIndex]);
            }
            return newRow;
        }
    });

    const csvData = XLSX.utils.sheet_to_csv(XLSX.utils.aoa_to_sheet(processedData));
    return csvData;
}

// Function to format the "user_choices" sheet
function formatUserChoices(worksheet: XLSX.WorkSheet): string {
    // Convert the worksheet to JSON to easily manipulate the data
    const jsonData: any[][] = XLSX.utils.sheet_to_json(worksheet, {header: 1, raw: false});

    // Extract the header row and find the indices of the columns to convert
    const headerRow = jsonData[0] as string[];
    const dateColumns = ['created_at', 'updated_at'];
    const dateIndices = dateColumns.map(header => headerRow.indexOf(header)).filter(index => index !== -1);

    // Process the data rows, converting the date columns using map
    const processedData = jsonData.map((row, rowIndex) => {
        if (rowIndex === 0) {
            return row; // Return header row as is
        } else {
            return convertDatesToUnix(row, dateIndices);
        }
    });

    // Convert the processed data back to a CSV string
    const csvData = XLSX.utils.sheet_to_csv(XLSX.utils.aoa_to_sheet(processedData));

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