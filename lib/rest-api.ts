import cdk = require("aws-cdk-lib");
import {
  aws_apigateway as apigateway,
  aws_dynamodb as dynamodb,
  aws_iam as iam,
  aws_lambda as lambda,
  aws_logs as cwlogs,
} from "aws-cdk-lib";
import { Construct } from "constructs";
import { Props } from "./global";
//import {UserPoolId} from 'samples-ts'  Reimport when deploying Cognito Stack

export class RestAPI extends cdk.Stack {
  constructor(scope: Construct, id: string, props: Props, table: dynamodb.Table) {
    super(scope, id, props);

    // const zone = route53.HostedZone.fromLookup(this, id + "Zone", {
    //   domainName: domainName,
    // });
    // const restAPIDomain = "sampleapi." + domainName;
    // // TLS certificate
    // const certificate = new acm.DnsValidatedCertificate(this, id + "RESTAPICert", {
    //   domainName: restAPIDomain,
    //   hostedZone: zone,
    // });

    // const domain = new apigateway.DomainName(this, "myApiDomain", {
    //   domainName: restAPIDomain,
    //   certificate: certificate,
    //   endpointType: apigateway.EndpointType.REGIONAL,
    // });

    const eventbridgePutPolicy = new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      resources: ["*"],
      actions: ["events:PutEvents"],
    });

    const postLocation = new lambda.Function(this, id + "postLocationHandler", {
      runtime: lambda.Runtime.GO_1_X,
      code: lambda.Code.fromAsset("../dist/postlocation.zip"),
      handler: "postlocation",

      timeout: cdk.Duration.seconds(3),
      logRetention: props.params.logRetentionPeriod,
    });
    postLocation.addToRolePolicy(eventbridgePutPolicy);

    // Query Handler ***********************************************************************************
    const queryLocation = new lambda.Function(this, id + "locationQueryHandler", {
      runtime: lambda.Runtime.GO_1_X,
      code: lambda.Code.fromAsset("../dist/querylocation.zip"),
      handler: "querylocation",
      environment: {
        TABLE_NAME: table.tableName,
      },

      timeout: cdk.Duration.seconds(3),
      logRetention: props.params.logRetentionPeriod,
    });
    queryLocation.addToRolePolicy(eventbridgePutPolicy);
    table.grantReadData(queryLocation);
    // API Gateway *************************************************************************************
    const prdLogGroup = new cwlogs.LogGroup(this, "APIGatewayLogs");

    const api = new apigateway.RestApi(this, id + "RestAPI", {
      restApiName: "Location API",
      description: "REST API",
      deployOptions: {
        loggingLevel: apigateway.MethodLoggingLevel.INFO,
        dataTraceEnabled: true,
        accessLogFormat: apigateway.AccessLogFormat.clf(),
        accessLogDestination: new apigateway.LogGroupLogDestination(prdLogGroup),
      },
    });

    const resource = api.root.addResource("location");
    resource.addMethod("GET", new apigateway.LambdaIntegration(queryLocation));

    //Redeploy when integrating Cognito Stack
    // const authoriser = new apigateway.CfnAuthorizer(this, id + "Authorisor", {
    //   restApiId: api.restApiId,
    //   name: "PostAuthorisor",
    //   type: apigateway.AuthorizationType.COGNITO,
    //   identitySource: "method.request.header.authorization",
    //   providerArns: ['arn:aws:cognito-idp:'+props.env!.region!+':'+props.env!.account!+':userpool/'+UserPoolId],
    // });

    resource.addMethod("POST", new apigateway.LambdaIntegration(postLocation), {
      //Add these when deploying Cognito Stack
      //authorizationType: apigateway.AuthorizationType.COGNITO,
      // authorizer:{authorizerId:authoriser.ref},
      // apiKeyRequired: false,
    });
    resource.addMethod("OPTIONS", new apigateway.LambdaIntegration(postLocation));

    new cdk.CfnOutput(this, `${id}-RESTAPI`, { value: api.url });
    // domain.addBasePathMapping(api);
  }
}
