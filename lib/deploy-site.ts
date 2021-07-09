import cdk = require("aws-cdk-lib");
import {
  aws_certificatemanager as acm,
  aws_cloudfront as cloudfront,
  aws_iam as iam,
  aws_lambda as lambda,
  aws_route53 as route53,
  aws_route53_patterns as route53patterns,
  aws_route53_targets as targets,
  aws_s3 as s3,
} from "aws-cdk-lib";
import { Construct } from "constructs";

export interface DeploySiteProps {
  domainName: string;
  siteName: string;
  siteBucket: s3.Bucket;
  lversion: lambda.Version;
  siteSubDomain: string;
}

export class DeploySite extends Construct {
  readonly distribution: cloudfront.CloudFrontWebDistribution;

  constructor(parent: Construct, id: string, props: DeploySiteProps) {
    super(parent, id);

    const zone = route53.HostedZone.fromLookup(this, id + "Zone", {
      domainName: props.domainName,
    });

    var recordNames: string[];

    recordNames = [];

    if (props.siteSubDomain === "www") {
      recordNames = [props.domainName];
      new route53patterns.HttpsRedirect(this, id + "Redirect", {
        recordNames: recordNames,
        targetDomain: props.siteName,
        zone: zone,
      });
    }

    // TLS certificate
    const certificateArn = new acm.DnsValidatedCertificate(this, id + "SiteCertificate", {
      domainName: props.siteName,
      subjectAlternativeNames: recordNames,
      hostedZone: zone,
    }).certificateArn;
    new cdk.CfnOutput(this, id + "Certificate", { value: certificateArn });

    const cloudFrontOAI = new cloudfront.OriginAccessIdentity(this, "OAI", {
      comment: `OAI for ${props.domainName} website.`,
    });

    const cloudfrontS3Access = new iam.PolicyStatement();
    cloudfrontS3Access.addActions("s3:GetBucket*");
    cloudfrontS3Access.addActions("s3:GetObject*");
    cloudfrontS3Access.addActions("s3:List*");
    cloudfrontS3Access.addResources(props.siteBucket.bucketArn);
    cloudfrontS3Access.addResources(`${props.siteBucket.bucketArn}/*`);
    cloudfrontS3Access.addCanonicalUserPrincipal(cloudFrontOAI.cloudFrontOriginAccessIdentityS3CanonicalUserId);

    props.siteBucket.addToResourcePolicy(cloudfrontS3Access);

    // CloudFront distribution that provides HTTPS
    this.distribution = new cloudfront.CloudFrontWebDistribution(this, id + "SiteDistribution", {
      viewerCertificate: {
        aliases: [props.siteName],
        props: {
          acmCertificateArn: certificateArn,
          sslSupportMethod: cloudfront.SSLMethod.SNI,
          minimumProtocolVersion: cloudfront.SecurityPolicyProtocol.TLS_V1_2_2019,
        },
      },
      errorConfigurations: [
        {
          errorCode: 403,
          responseCode: 403,
          responsePagePath: "/index.html",
          errorCachingMinTtl: 86400,
        },
        {
          errorCode: 404,
          responseCode: 403,
          responsePagePath: "/index.html",
          errorCachingMinTtl: 86400,
        },
      ],
      originConfigs: [
        {
          s3OriginSource: {
            s3BucketSource: props.siteBucket,
            originAccessIdentity: cloudFrontOAI,
          },
          behaviors: [
            {
              isDefaultBehavior: true,

              lambdaFunctionAssociations: [
                {
                  eventType: cloudfront.LambdaEdgeEventType.VIEWER_RESPONSE,
                  lambdaFunction: props.lversion,
                },
              ],
            },
          ],
        },
      ],
    });
    new cdk.CfnOutput(this, id + "DistributionId", {
      value: this.distribution.distributionId,
    });

    // Route53 alias record for the CloudFront distribution
    new route53.ARecord(this, id + "SiteAliasRecord", {
      recordName: props.siteName,
      target: route53.RecordTarget.fromAlias(new targets.CloudFrontTarget(this.distribution)),
      zone,
    });
  }
}
