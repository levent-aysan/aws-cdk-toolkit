import cdk = require("aws-cdk-lib");
import {
  aws_dynamodb as dynamodb,
  aws_events as events,
  aws_events_targets as events_targets,
  aws_iam as iam,
  aws_lambda as lambda,
} from "aws-cdk-lib";
import { Construct } from "constructs";
import { Props } from "./global";

export class EventListener extends cdk.Stack {
  constructor(scope: Construct, id: string, props: Props, table: dynamodb.Table) {
    super(scope, id, props);

    const eventbridgePutPolicy = new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      resources: ["*"], //TODO: Reduce scope from *
      actions: ["events:PutEvents"],
    });

    const apigatewayManagmentPolicy = new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      resources: ["*"], // TODO:  Restrict Access
      actions: ["execute-api:Invoke", "execute-api:ManageConnections"],
    });

    const transformRule = new events.Rule(this, id + "transformRule", {
      description: "Transforms Updates ready for ",
      eventPattern: {
        source: ["Location"],
        detailType: ["Update"],
      },
    });

    const transformLambda = new lambda.Function(this, id + "TransformLambdaHandler", {
      runtime: lambda.Runtime.NODEJS_12_X,
      code: lambda.Code.fromAsset("../lambdas/transform"),
      handler: "transform.handler",

      timeout: cdk.Duration.seconds(3),
      logRetention: props.params.logRetentionPeriod,
    });
    transformLambda.addToRolePolicy(eventbridgePutPolicy);

    transformRule.addTarget(new events_targets.LambdaFunction(transformLambda));

    const observeLambda = new lambda.Function(this, id + "ObserveLambdaHandler", {
      runtime: lambda.Runtime.NODEJS_12_X,
      code: lambda.Code.fromAsset("../lambdas/observe"),
      handler: "observe.handler",

      timeout: cdk.Duration.seconds(3),
      logRetention: props.params.logRetentionPeriod,
    });

    // Observer ******************************************************************************************

    observeLambda.addToRolePolicy(eventbridgePutPolicy);
    // Create EventBridge rule to route events
    const observeRule = new events.Rule(this, "observeRule", {
      description: "all events are caught here and logged centrally",
      eventPattern: {
        source: ["Location", "WS"],
      },
    });

    observeRule.addTarget(new events_targets.LambdaFunction(observeLambda));

    //   const awsRule = new events.Rule(this, id + "awsRule", {
    //     description: "AWS Rule",
    //     eventPattern: {
    //       source: ["Location"],
    //       detailType: ["Transformed"],
    //       detail: {
    //         products: {
    //           pudo: ["operational"],
    //         },
    //       },
    //     },
    //   });

    //   // Listener Just for AWS Messages *******************************************************
    //   const awsLambda = new lambda.Function(this, id + "awsLambdaHandler", {
    //     runtime: lambda.Runtime.NODEJS_12_X,
    //     code: lambda.Code.fromAsset("../lambdas/observe"),
    //     handler: "observe.handler",

    //     timeout: cdk.Duration.seconds(3),
    //   });
    //   awsLambda.addToRolePolicy(eventbridgePutPolicy);

    //   awsRule.addTarget(new events_targets.LambdaFunction(awsLambda));

    // Location Loader ****************************************************************************
    const load = new lambda.Function(this, id + "loadLocationHandler", {
      runtime: lambda.Runtime.GO_1_X,
      code: lambda.Code.fromAsset("../dist/loadlocation.zip"),
      handler: "loadlocation",
      environment: {
        TABLE_NAME: table.tableName,
      },

      timeout: cdk.Duration.seconds(3),
      logRetention: props.params.logRetentionPeriod,
    });
    load.addToRolePolicy(eventbridgePutPolicy);
    // Create EventBridge rule to route events
    const loadLocationRule = new events.Rule(this, id + "loadLocationRule", {
      description: "Loads Locations into the database",
      eventPattern: {
        source: ["Location"],
        detailType: ["Transformed"],
      },
    });
    table.grantReadWriteData(load);
    loadLocationRule.addTarget(new events_targets.LambdaFunction(load));

    // Web Soecket Connection Loader ********************************************************************
    const loadWS = new lambda.Function(this, id + "loadWSHandler", {
      runtime: lambda.Runtime.GO_1_X,
      code: lambda.Code.fromAsset("../dist/loadws.zip"),
      handler: "loadws",
      environment: {
        TABLE_NAME: table.tableName,
      },

      timeout: cdk.Duration.seconds(3),
      logRetention: props.params.logRetentionPeriod,
    });
    loadWS.addToRolePolicy(eventbridgePutPolicy);
    // Create EventBridge rule to route events
    const WSRule = new events.Rule(this, id + "WSRule", {
      description: "Loads WSs into the database",
      eventPattern: {
        source: ["WS"],
        detailType: ["Transformed"],
      },
    });
    table.grantReadWriteData(loadWS);
    WSRule.addTarget(new events_targets.LambdaFunction(loadWS));

    // Notifier ****************************************************************************************
    const notify = new lambda.Function(this, "notifyHandler", {
      runtime: lambda.Runtime.GO_1_X,
      code: lambda.Code.fromAsset("../dist/notify.zip"),
      handler: "notify",
      environment: {
        TABLE_NAME: table.tableName,
      },

      timeout: cdk.Duration.seconds(3),
      logRetention: props.params.logRetentionPeriod,
    });
    notify.addToRolePolicy(eventbridgePutPolicy);
    notify.addToRolePolicy(apigatewayManagmentPolicy);
    // Create EventBridge rule to route events
    const notifyRule = new events.Rule(this, "notifyRule", {
      description: "Notify that a Location has been loaded",
      eventPattern: {
        source: ["Location"],
        detailType: ["Loaded"],
      },
    });
    table.grantReadData(notify);
    notifyRule.addTarget(new events_targets.LambdaFunction(notify));
  }
}
