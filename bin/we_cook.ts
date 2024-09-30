#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { WeCookStack } from '../lib/we_cook-stack';

const app = new cdk.App();
const weCookStack = new WeCookStack(app, 'MealRecommendationStack', {
});
