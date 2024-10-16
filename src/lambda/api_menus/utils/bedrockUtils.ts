import { BedrockRuntimeClient, InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime"

// Initialize the Bedrock client with your region
const bedrockClient = new BedrockRuntimeClient({ region: "us-east-1" })


async function callBedrock(prompt:string, dataset: string,temperature: number = 0,  modelId: string = "anthropic.claude-3-haiku-20240307-v1:0") {

    // modelId= "anthropic.claude-3-sonnet-20240229-v1:0",
    //modelId= "anthropic.claude-3-5-sonnet-20240620-v1:0";
    // prepare Claude 3 prompt
    const params = {
        modelId: modelId,
        contentType: "application/json",
        accept: "application/json",
        body: JSON.stringify({
            anthropic_version: "bedrock-2023-05-31",
            max_tokens: 2048,
            temperature: temperature,
            messages: [
                {
                    role: "user",
                    content: [
                        {
                            "type": "text",
                            "text": prompt
                        },{
                            "type": "text",
                            "text": dataset
                        }
                    ]
                }
            ]
        })
    }


    try {
        // Create a command object with the request information
        const command = new InvokeModelCommand(params)
        // Use the client to send the command to Amazon Bedrock
        const response = await bedrockClient.send(command)

        // Parse the answer
        const textDecoder = new TextDecoder("utf-8")
        const response_body = JSON.parse(textDecoder.decode(response.body))
        console.log("response_body",response_body)


        // Return the parsed information
        const jsonInformation = JSON.parse(response_body.content[0].text)
        return jsonInformation
    } catch (err: any) {
        console.error("Error invoking Bedrock:", err)
        return {
            statusCode: 500,
            response: JSON.stringify({
                message: "Failed to upload the file",
                error: err.message
            })
        }
    }
}

export async function generateImageWithTitan(description: string): Promise<string> {
    const params = {
        modelId: "amazon.titan-image-generator-v2:0",
        contentType: "application/json",
        accept: "application/json",
        body: JSON.stringify({
            taskType: "TEXT_IMAGE",
            textToImageParams: {
                text: "Create a photo realistic picture of a meal like in recipe book. The meal is : " + description
            },
            imageGenerationConfig: {
                numberOfImages: 1,
                quality: "standard",
                cfgScale: 8.0,
                seed: Math.floor(Math.random() * 1000000)
            }
        })
    };

    try {
        const command = new InvokeModelCommand(params);
        const response = await bedrockClient.send(command);
        const responseBody = JSON.parse(new TextDecoder().decode(response.body));

        if (responseBody.images && responseBody.images.length > 0) {
            return responseBody.images[0];
        } else {
            throw new Error("No image generated");
        }
    } catch (err: any) {
        console.error("Error invoking Titan Image Generator:", err);
        throw err;
    }
}

export default callBedrock
