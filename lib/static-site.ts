import cdk = require("aws-cdk-lib");
import { Construct } from "constructs";
import { aws_s3 as s3 } from "aws-cdk-lib";
import { aws_s3_deployment as s3deploy } from "aws-cdk-lib";
import { aws_lambda as lambda } from "aws-cdk-lib";
import { DeploySite } from "./deploy-site";

export interface StaticSiteProps extends cdk.StackProps {
  domainName: string;
  siteSubDomain: string;
  logRetentionPeriod: number | undefined;
}

function sprintf(strings: TemplateStringsArray, ...indices: number[]) {
  return (...values: string[]) =>
    strings.reduce((total, part, index) => total + part + (values[indices[index]] || ""), "");
}

// create a simple code checksum so that each version is unique
function checksum(s: string): string {
  var strlen = s.length,
    i: number,
    c: number;
  var hash = 0;
  if (strlen === 0) {
    return "";
  }
  for (i = 0; i < strlen; i++) {
    c = s.charCodeAt(i);
    hash = (hash << 5) - hash + c;
    hash = hash & hash; //Convert to 32 bit
  }
  return hash.toString();
}

export class StaticSite extends cdk.Stack {
  constructor(scope: Construct, id: string, props: StaticSiteProps) {
    super(scope, id, props);

    const headers = [
      { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubdomains; preload" },
      { key: "Content-Security-Policy", value: "script-src 'self' 'unsafe-inline';" },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "X-XSS-Protection", value: "1; mode=block" },
      { key: "Referrer-Policy", value: "same-origin" },
      {
        key: "Feature-Policy",
        value:
          "accelerometer 'none'; ambient-light-sensor 'none'; autoplay 'none'; camera 'none'; encrypted-media 'none'; fullscreen 'none'; geolocation 'none'; gyroscope 'none'; magnetometer 'none'; microphone 'none'; midi 'none';  picture-in-picture 'none'; speaker 'none'; sync-xhr 'none'; usb  'none'; vr 'none'",
      },
    ];
    // To apply security headers a lambda needs to be generated

    const codeStart = `'use strict';
        exports.handler = (event, context, callback) => {
        const response = event.Records[0].cf.response;
        const headers = response.headers;
        `;

    const headerTemplate = sprintf`headers["${0}"]= [{key: "${0}",value: "${1}"}];
        `;

    const codeEnd = `callback(null, response);
        };`;

    let code = codeStart;

    headers.forEach((element) => {
      code = code.concat(headerTemplate(element.key, element.value));
    });

    code = code.concat(codeEnd);
    const edgelambda = new lambda.Function(this, id + "Headers", {
      code: lambda.Code.fromInline(code),
      handler: "index.handler",
      runtime: lambda.Runtime.NODEJS_12_X,
      memorySize: 128,
      logRetention: props.logRetentionPeriod,
    });

    // the code must have a checksum to identify it otherwise it is not possible to update the code
    // when new headers are required
    const lversion = edgelambda.currentVersion;

    const siteDomain = props.siteSubDomain + "." + props.domainName;
    new cdk.CfnOutput(this, `${id}-Site`, { value: "https://" + siteDomain });

    // Content bucket
    const siteBucket = new s3.Bucket(this, id + "SiteBucket", {
      bucketName: siteDomain,
      websiteIndexDocument: "index.html",
      websiteErrorDocument: "index.html",
      publicReadAccess: false,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });
    new cdk.CfnOutput(this, `${id}-Bucket`, { value: siteBucket.bucketName });

    const website = new DeploySite(this, id + "Website", {
      domainName: props.domainName,
      siteName: siteDomain,
      siteBucket: siteBucket,
      lversion: lversion,
      siteSubDomain: props.siteSubDomain,
    });

    // Deploy site contents to S3 bucket
    new s3deploy.BucketDeployment(this, id + "DeployWithInvalidation", {
      sources: [s3deploy.Source.asset("../ui/build")],
      destinationBucket: siteBucket,
      distribution: website.distribution,
      distributionPaths: ["/*"],
      memoryLimit: 1024,
    });
  }
}
