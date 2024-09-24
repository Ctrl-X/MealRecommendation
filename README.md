# Welcome to Menu Recommendation engine



## Description
The goal of this POC is to recommend menu based on customer preferences:
- previous ordered menus
- ingredients of menus
- favorites
- allergic settings

## How it work
### Step 1 : Datalake
We create a datalake in S3 with 3 stage : raw, formatted, curated. A lambda is called during each step to process data for the next step.
Why not use Glue to ETL ? We want to be flexible in the processing ( we call Claude and make some fancy transformation in the curated stage)
Maybe we will change for Glue in the future if quicker and easier


## Project structure
- **src**
  - **lambda**
    - **formated**: contain the lambda that will get meaningful information from the formatted data to build the curated stage
    - **raw**: contain the lambda that process the raw Excel file into multiple csv files
    - **curated**: contain the lambda that process the raw Excel file into multiple csv files
- **lib**: contain the CDK stack
- **bin**: contain the main CDK root application




## Useful commands
The `cdk.json` file tells the CDK Toolkit how to execute your app.

* `npm run build`   compile typescript to js
* `npx cdk deploy`  deploy this stack to your default AWS account/region
* `npx cdk diff`    compare deployed stack with current state
* `npx cdk synth`   emits the synthesized CloudFormation template

