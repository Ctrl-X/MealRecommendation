#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { MealRecommendationStack } from '../lib/meal-reco-stack';

const app = new cdk.App();
const weCookStack = new MealRecommendationStack(app, 'MealRecommendationStack', {
});
