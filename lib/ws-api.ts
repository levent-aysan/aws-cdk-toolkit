import cdk = require("aws-cdk-lib");

import { aws_apigatewayv2 as apigateway, aws_dynamodb as dynamodb, aws_lambda as lambda } from "aws-cdk-lib";
import { Construct, DependencyGroup } from "constructs";
import { Props } from "./global";
import { aws_iam as iam } from "aws-cdk-lib";

export class WSAPI extends cdk.Stack {
  constructor(scope: Construct, id: string, props: Props, table: dynamodb.Table) {
    super(scope, id, props);

    // IAMs Policies **********************************************************************************
    const eventbridgePutPolicy = new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      resources: ["*"],
      actions: ["events:PutEvents"],
    });
    const name = id + "WSAPI";

    const api = new apigateway.CfnApi(this, name, {
      name: "WSAPI",
      protocolType: "WEBSOCKET",
      routeSelectionExpression: "$request.body.action",
    });

    // Connect Handler ********************************************************************************
    const connect = new lambda.Function(this, "connectHandler", {
      runtime: lambda.Runtime.GO_1_X,
      code: lambda.Code.fromAsset("../dist/connect.zip"),
      handler: "connect",
      environment: {
        TABLE_NAME: table.tableName,
      },

      timeout: cdk.Duration.seconds(3),
      logRetention: props.params.logRetentionPeriod,
    });
    connect.addToRolePolicy(eventbridgePutPolicy);

    // access role for the socket api to access the socket lambda
    const policy = new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      resources: [connect.functionArn],
      actions: ["lambda:InvokeFunction"],
    });

    const role = new iam.Role(this, `${name}-iam-role`, {
      assumedBy: new iam.ServicePrincipal("apigateway.amazonaws.com"),
    });
    role.addToPolicy(policy);

    // lambda integration
    const connectIntegration = new apigateway.CfnIntegration(this, "connect-lambda-integration", {
      apiId: api.ref,
      integrationType: "AWS_PROXY",
      integrationUri:
        "arn:aws:apigateway:" +
        props.env!.region +
        ":lambda:path/2015-03-31/functions/" +
        connect.functionArn +
        "/invocations",
      credentialsArn: role.roleArn,
    });

    const connectRoute = new apigateway.CfnRoute(this, "connect-route", {
      apiId: api.ref,
      routeKey: "$connect",
      authorizationType: "NONE",
      target: "integrations/" + connectIntegration.ref,
    });

    const disconnectRoute = new apigateway.CfnRoute(this, "disconnect-route", {
      apiId: api.ref,
      routeKey: "$disconnect",
      authorizationType: "NONE",
      target: "integrations/" + connectIntegration.ref,
    });

    const deployment = new apigateway.CfnDeployment(this, `${name}-deployment`, {
      apiId: api.ref,
    });

    new apigateway.CfnStage(this, `${name}-stage`, {
      apiId: api.ref,
      autoDeploy: true,
      deploymentId: deployment.ref,
      stageName: "prod",
    });

    const dependencies = new DependencyGroup();
    dependencies.add(connectRoute);
    dependencies.add(disconnectRoute);
    deployment.node.addDependency(dependencies);
    new cdk.CfnOutput(this, `${id}-WSAPI`, {
      value: "wss://" + deployment.apiId + ".execute-api." + props.env!.region + ".amazonaws.com/prod",
    });
  }
}
