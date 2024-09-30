import callBedrock from "./utils/bedrockUtils";


export async function curatingData(fileContent: string): Promise<string> {
    // Split the CSV content into rows
    const rows = fileContent.split('\n');

    // Extract the header and find indices for "FoodCost" and "LaborCost"
    const sourceheaders = rows[0].split('\t');
    console.log("headers", sourceheaders)
    const indexIdIndex = sourceheaders.indexOf('ITEM_ID');
    const creationIndex = sourceheaders.indexOf('CREATION_TIMESTAMP');
    const foodCostIndex = sourceheaders.indexOf('FoodCost');
    const laborCostIndex = sourceheaders.indexOf('LaborCost');
    const mealNameIndex = sourceheaders.indexOf('Meal');
    const ingredientsIndex = sourceheaders.indexOf('Ingredients');

    if (mealNameIndex === -1 || foodCostIndex === -1 || laborCostIndex === -1 || ingredientsIndex === -1) {
        throw new Error('Required columns "FoodCost", "LaborCost", or "Ingredients" not found.');
    }

    // Add "TotalCost" to the headers
    const headers: string[] = []
    headers.push('ITEM_ID', 'PRICE', 'CREATION_TIMESTAMP', 'NAME', 'GENRES', 'GENRE_L2', 'GENRE_L3', 'PRODUCT_DESCRIPTION', 'CONTENT_CLASSIFICATION');
    rows.shift() // removing header

    // Process each row to calculate "TotalCost"
    const processedRows = await Promise.all(rows.map(async (row, rowIndex) => {
        const columns = []

        const existingColumns = row.split('\t');
        const indexId = parseFloat(existingColumns[indexIdIndex]);
        const creation = parseFloat(existingColumns[creationIndex]);
        const foodCost = parseFloat(existingColumns[foodCostIndex]);
        const laborCost = parseFloat(existingColumns[laborCostIndex]);
        const totalCost = (foodCost || 0) + (laborCost || 0);
        columns.push(indexId);
        columns.push(totalCost.toFixed(2));
        columns.push(creation);

        const mealName = existingColumns[mealNameIndex]  || ' ';
        columns.push(mealName.replace(/,/g, ' '));
        const ingredients = existingColumns[ingredientsIndex];
        const parsedIngredients = await parseIngredients(mealName, ingredients);
        columns.push(parsedIngredients.GENRES || '');
        columns.push(parsedIngredients.GENRE_L2 || '');
        columns.push(parsedIngredients.GENRE_L3 || '');
        let product_Description = mealName + " " + parsedIngredients.other.join(" ") || ' ';
        product_Description = product_Description.replace(/,/g, ' ')
        columns.push(product_Description);
        columns.push(parsedIngredients.CONTENT_CLASSIFICATION || 'none');

        return columns.join(',');
    }));

    processedRows.unshift(headers.join(','))
    return processedRows.join('\n')

}


async function parseIngredients(meal: string, ingredients: string): Promise<{
    other: any;
    GENRES: any;
    CONTENT_CLASSIFICATION: any;
    GENRE_L3: any;
    GENRE_L2: any
}> {
    const prompt = `Act as a cooking chef that need to extract menu information in a structured JSON.
    I am providing your with a list of ingredients from a meal named <meal>${meal}</meal> : <ingredients>${ingredients}</ingredients>.
    Your task is to generate a JSON with this structure : {cuisine_type:"",primary_ingredient:"",secondary_ingredient:"", third_ingredient:"", other_ingredients:List}.
    Every ingredient in the list need to be adapted to its ingredient base name. For example if you have "yukon potatoes", the ingredient base name is "potato". If you have "Fried pork", the ingredient base name is "pork".
    The "cuisine_type" should be your understanding of the type of cuisine (like mexican, greek, chinese, fast-food,greek,Healthy,Korean, indian or any other type of cuisine) based on the meal name and ingredients.
    The "primary_ingredient" should contain the ingredient from the list that belong to the protein food group : "Beans, pulses,fish, eggs, meat and other proteins".
    The "secondary_ingredient" should contain the main ingredient from the list that belong to the grains food group : "Potatoes,bread,rice, pasta, fries and other starchy carbohydrates".
    The "third_ingredient" should contain the main ingredient from the list that belong to the vegetables food group : "name of Fruit, name of vegetables or other name of spice".
    The "other_ingredients" should be a list of all other ingredients food group (spices, dairy product, fruits), in their ingredient base form name.
    Skip preambule and only give a valid JSON in your response.`;

    try {
        const response = await callBedrock(prompt, ingredients);
        console.log("Bedrock response", response)
        return {
            GENRES: response.primary_ingredient || '',
            GENRE_L2: response.secondary_ingredient || '',
            GENRE_L3: response.third_ingredient || '',
            CONTENT_CLASSIFICATION: response.cuisine_type || '',
            other: response.other_ingredients || []
        };
    } catch (error) {
        console.error('Error parsing ingredients:', error);
        return {other: [], CONTENT_CLASSIFICATION: undefined, GENRES: '', GENRE_L2: '', GENRE_L3: ''};
    }
}