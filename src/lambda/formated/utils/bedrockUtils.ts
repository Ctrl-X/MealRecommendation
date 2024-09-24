import { BedrockRuntimeClient, InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime"

// Initialize the Bedrock client with your region
const bedrockClient = new BedrockRuntimeClient({ region: "us-east-1" })
const { ApplyGuardrailCommand } = require("@aws-sdk/client-bedrock")


async function callBedrock(prompt:string, dataset: string,  modelId: string = "anthropic.claude-3-haiku-20240307-v1:0") {

    // modelId= "anthropic.claude-3-sonnet-20240229-v1:0",
    // modelId= "anthropic.claude-3-5-sonnet-20240620-v1:00",
    // prepare Claude 3 prompt
    const params = {
        modelId: modelId,
        contentType: "application/json",
        accept: "application/json",
        body: JSON.stringify({
            anthropic_version: "bedrock-2023-05-31",
            max_tokens: 2048,
            temperature: 0,
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

export default callBedrock
