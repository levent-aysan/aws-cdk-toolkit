#!/usr/bin/env node
import cdk = require("aws-cdk-lib");
import "source-map-support/register";
import { Database } from "../lib/database";
import { EventListener } from "../lib/event-listener";
import { RestAPI } from "../lib/rest-api";
import { StaticSite } from "../lib/static-site";
import { WSAPI } from "../lib/ws-api";
import { SPMAccountDetails } from "spm-consts";

const app = new cdk.App();

const accountDetails = SPMAccountDetails(process.env.AWS_PROFILE);
const environment = {
  env: { region: accountDetails.region, account: accountDetails.account },
  params: { logRetentionPeriod: accountDetails.logRetentionPeriod },
};

if (accountDetails.envtype != "development") {
  // Only deploy this stack in development
  process.exit(0);
}
if (accountDetails.account === undefined) {
  console.log("Environment Variable AWS_PROFILE not set");
  process.exit(-1);
}
if (accountDetails.route53ZoneName === undefined) {
  console.log("Domain Name not defined");
  process.exit(-1);
}
const domainName = accountDetails.route53ZoneName;
const id = "SPM";

const db = new Database(app, id + "-db", environment);

new EventListener(app, id + "-el", environment, db.table);

new RestAPI(app, id + "RestAPI", environment, db.table);

new WSAPI(app, id + "WSAPI", environment, db.table);

new StaticSite(app, id + "-web", {
  env: {
    // Stack must be in us-east-1, because the ACM certificate for a
    // global CloudFront distribution must be requested in us-east-1.
    region: "us-east-1",
    account: environment.env!.account,
  },
  domainName: domainName,
  siteSubDomain: "samples-demo",
  logRetentionPeriod: accountDetails.logRetentionPeriod,
});
