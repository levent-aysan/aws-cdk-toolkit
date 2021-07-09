import cdk = require("aws-cdk-lib");

export interface Props extends cdk.StackProps {
  readonly params: {
    readonly logRetentionPeriod: number | undefined;
  };
}
