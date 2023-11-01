import * as cdk from 'aws-cdk-lib';                 // core constructs
import * as events from "aws-cdk-lib/aws-events";
import * as targets from "aws-cdk-lib/aws-events-targets";
import * as iam from "aws-cdk-lib/aws-iam";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as sfn from "aws-cdk-lib/aws-stepfunctions";
import * as tasks from "aws-cdk-lib/aws-stepfunctions-tasks";
import * as path from "path";
import { Construct } from 'constructs';
import { readFileSync } from "fs";

export class AwsStepfunctionsAuroraCloneStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const auroraCloneLambda = new lambda.Function(this, "AuroraCloneLambda", {
      functionName: "aurora_clone",
      runtime: lambda.Runtime.PYTHON_3_8,
      handler: "index.lambda_handler",
      timeout: cdk.Duration.seconds(30),
      code: lambda.Code.fromInline(
        readFileSync(
          path.join(__dirname, "../functions/aurora_clone.py"),
          "utf-8"
        )
      ),
    });

    auroraCloneLambda.addToRolePolicy(
      new iam.PolicyStatement({
        actions: [
          "rds:RestoreDBClusterToPointInTime",
          "rds:CreateDBInstance",
          "rds:AddTagsToResource",
        ],
        resources: ["*"],
      })
    );

    const auroraCheckStatusLambda = new lambda.Function(
      this,
      "AuroraCheckStatusLambda",
      {
        runtime: lambda.Runtime.PYTHON_3_8,
        handler: "index.lambda_handler",
        functionName: "aurora_check_status",
        code: lambda.Code.fromInline(
          readFileSync(
            path.join(__dirname, "../functions/aurora_check_status.py"),
            "utf-8"
          )
        ),
      }
    );

    auroraCheckStatusLambda.addToRolePolicy(
      new iam.PolicyStatement({
        resources: ["*"],
        actions: ["rds:DescribeDBClusters"],
      })
    );

    const clearTargetLambda = new lambda.Function(
      this,
      "AuroraClearTargetLambda",
      {
        runtime: lambda.Runtime.PYTHON_3_8,
        handler: "index.lambda_handler",
        functionName: "aurora_clear_target",
        code: lambda.Code.fromInline(
          readFileSync(
            path.join(__dirname, "../functions/aurora_clear_target.py"),
            "utf-8"
          )
        ),
      }
    );

    clearTargetLambda.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["rds:DeleteDBCluster", "rds:DeleteDBInstance"],
        resources: ["*"],
      })
    );

    const checkStatusJob = new tasks.LambdaInvoke(this, "Get cluster status", {
      lambdaFunction: auroraCheckStatusLambda,
      outputPath: "$.Payload",
    });

    const clearTargetJob = new tasks.LambdaInvoke(this, "Delete cluster", {
      lambdaFunction: clearTargetLambda,
      resultPath: sfn.JsonPath.DISCARD,
    });

    const auroraCloneJob = new tasks.LambdaInvoke(this, "Aurora Clone", {
      lambdaFunction: auroraCloneLambda,
    });

    const clusterExists = new sfn.Choice(this, "Cluster exists?");

    const waitStep = new sfn.Wait(this, "Wait 30 seconds", {
      time: sfn.WaitTime.duration(cdk.Duration.seconds(30)),
    });

    waitStep.next(checkStatusJob);

    clearTargetJob.next(waitStep);

    clusterExists.when(
      sfn.Condition.stringEquals("$.status", "available"),
      clearTargetJob
    );

    clusterExists.when(
      sfn.Condition.stringEquals("$.status", "deleting"),
      waitStep
    );

    clusterExists.when(
      sfn.Condition.stringEquals("$.status", "not-found"),
      auroraCloneJob
    );

    const startState = checkStatusJob.next(clusterExists);

    const auroraCloneStateMachine = new sfn.StateMachine(
      this,
      "AuroraCloneStateMachine",
      {
          stateMachineName: "AuroraCloneSourceCluster",
          definitionBody: sfn.DefinitionBody.fromChainable(startState),
          timeout: cdk.Duration.minutes(5)
      }
    );

    const event = {
      SourceDBClusterIdentifier: "app-prod",
      TargetDBClusterIdentifier: "app-staging",
      TargetDBInstanceIdentifier: "app-staging-instance-1",
      TargetDBSubnetGroupName: "sample",
      TargetDBInstanceClass: "db.t4g.medium",
      TargetDBEngine: "aurora-postgresql",
      TargetVpcSecurityGroupIds: ["sg-0a1b2c3d"],
      TargetDBClusterParameterGroupName: "default.aurora-postgresql11",
      Port: 5432,
      TargetTags: [
        {
          Key: "Environment",
          Value: "staging",
        },
      ],
    };

    // Daily at 12 AM UTC

    const rule = new events.Rule(this, "Rule", {
      schedule: events.Schedule.cron({ minute: "0", hour: "0" }),
    });

    rule.addTarget(
      new targets.SfnStateMachine(auroraCloneStateMachine, {
        input: events.RuleTargetInput.fromObject(event),
      })
    );
  }
}
