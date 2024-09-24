import callBedrock from "./utils/bedrockUtils";

export async function curatingData(fileContent: string): Promise<string> {
    // Split the CSV content into rows
    console.log("fileContent",fileContent)
    const rows = fileContent.split('\n');

    // Extract the header and find indices for "FoodCost" and "LaborCost"
    const headers = rows[0].split('\t');
    console.log("headers",headers)
    const foodCostIndex = headers.indexOf('FoodCost');
    const laborCostIndex = headers.indexOf('LaborCost');
    const ingredientsIndex = headers.indexOf('Ingredients');

    if (foodCostIndex === -1 || laborCostIndex === -1 || ingredientsIndex === -1) {
        throw new Error('Required columns "FoodCost", "LaborCost", or "Ingredients" not found.');
    }
  
    // Add "TotalCost" to the headers
    headers.push('TotalCost', 'GENRES', 'GENRE_L2', 'GENRE_L3');
  
    // Process each row to calculate "TotalCost"
    const processedRows = await Promise.all(rows.map(async (row, rowIndex) => {
        if (rowIndex === 0) {
            return headers.join('\t');
        }

        const columns = row.split('\t');
        const foodCost = parseFloat(columns[foodCostIndex]);
        const laborCost = parseFloat(columns[laborCostIndex]);
        const totalCost = (foodCost || 0) + (laborCost || 0);
        columns.push(totalCost.toFixed(2));

        const ingredients = columns[ingredientsIndex];
        const parsedIngredients = await parseIngredients(ingredients);
        columns.push(parsedIngredients.GENRES || '');
        columns.push(parsedIngredients.GENRE_L2 || '');
        columns.push(parsedIngredients.GENRE_L3 || '');

        return columns.join('\t');
    }));

    return processedRows.join('\n');

  }



async function parseIngredients(ingredients: string): Promise<{ GENRES: string, GENRE_L2: string, GENRE_L3: string }> {
    const prompt = `I am providing your with a list of ingredients from food menu recipes.
    I want you to extract each ingredient family and return the first 3 ingredients as a JSON object with keys "GENRES", "GENRE_L2", and "GENRE_L3".
    You need to sort the ingredient based on importance of ingredients in the meal. 
    The main ingredient family (like chicken, beef, porc, lamb, tofu, vegan or else) should be put in the "GENRES" JSON key for instance. 
    Then the second main ingredient, usually the side dishes, should be in "GENRE_L2".
    Then the last most important ingredient like spice or name of vegetable should be put in "GENRE_L3".
    For each ingredients, it is important to get the base ingredient family. For exemple if you see "yukon potatoes", the ingredient family is "potato". 
    Another exemple is if the ingredient is "dry garlic flakes", then the ingredient family is "garlic".
    Skip preambule and only give a valid JSON in your response. Here is the list of ingredients:`;

    try {
        const response = await callBedrock(prompt, ingredients);
        console.log("Bedrock response",response)
        return {
            GENRES: response.GENRES || '',
            GENRE_L2: response.GENRE_L2 || '',
            GENRE_L3: response.GENRE_L3 || ''
        };
    } catch (error) {
        console.error('Error parsing ingredients:', error);
        return { GENRES: '', GENRE_L2: '', GENRE_L3: '' };
    }
}