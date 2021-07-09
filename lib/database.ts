import cdk = require("aws-cdk-lib");
import { Construct } from "constructs";
import { aws_dynamodb as dynamodb } from "aws-cdk-lib";

export class Database extends cdk.Stack {
  readonly table: dynamodb.Table;
  constructor(scope: Construct, id: string, props: cdk.StackProps) {
    super(scope, id, props);
    const sortKey = { name: "SK", type: dynamodb.AttributeType.STRING };
    const partitionKey = { name: "HK", type: dynamodb.AttributeType.STRING };
    this.table = new dynamodb.Table(this, id + "Table", {
      partitionKey: partitionKey,
      sortKey: sortKey,
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      tableName: "SPMMainDB",
    });
    // Create GSI
    this.table.addGlobalSecondaryIndex({
      indexName: "K1SK",
      partitionKey: { name: "K1SK", type: dynamodb.AttributeType.STRING },
      sortKey: sortKey,
      projectionType: dynamodb.ProjectionType.KEYS_ONLY,
    });
    this.table.addGlobalSecondaryIndex({
      indexName: "K2SK",
      partitionKey: { name: "K2SK", type: dynamodb.AttributeType.STRING },
      sortKey: sortKey,
      projectionType: dynamodb.ProjectionType.KEYS_ONLY,
    });
    this.table.addGlobalSecondaryIndex({
      indexName: "K1HK",
      partitionKey: { name: "K1HK", type: dynamodb.AttributeType.STRING },
      sortKey: partitionKey,
      projectionType: dynamodb.ProjectionType.KEYS_ONLY,
    });
    this.table.addGlobalSecondaryIndex({
      indexName: "K2HK",
      partitionKey: { name: "K2HK", type: dynamodb.AttributeType.STRING },
      sortKey: partitionKey,
      projectionType: dynamodb.ProjectionType.KEYS_ONLY,
    });
    this.table.addGlobalSecondaryIndex({
      indexName: "SKHK",
      partitionKey: { name: "SK", type: dynamodb.AttributeType.STRING },
      sortKey: partitionKey,
      projectionType: dynamodb.ProjectionType.KEYS_ONLY,
    });
  }
}
