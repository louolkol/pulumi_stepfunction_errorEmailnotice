import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";


// create a role for lambda function
const roleForlambdatest = new aws.iam.Role("roleForlambda", {
            name: "roleForlambdatest",
            // create a assumerole policy which allows lambda to assume this role
            assumeRolePolicy: JSON.stringify({
            "Version": "2012-10-17",
            "Statement": [
                {
                    "Action": "sts:AssumeRole",
                    "Principal": {
                        "Service": "lambda.amazonaws.com"
                    },

                    "Effect": "Allow",
                },
            ],
        }),
        // create a inline policy which allows lambda to create log group and log stream
        inlinePolicies: [
            {
                name: "my_inline_policy",
                policy: JSON.stringify({
                    "Version": "2012-10-17",
                    "Statement": [
                        {
                            "Effect": "Allow",
                            "Action": "logs:CreateLogGroup",
                            "Resource": "*"
                        },
                        {
                            "Effect": "Allow",
                            "Action": [
                                "logs:CreateLogStream",
                                "logs:PutLogEvents"
                            ],
                            "Resource": [
                                "*"
                            ]
                        }
                    ],
                }),
            },
        ],
    });

    // create a lambda function
    const testLambda = new aws.lambda.Function("testLambda", {
        code: new pulumi.asset.AssetArchive({
            "index.js": new pulumi.asset.StringAsset(`
                exports.handler = async (event) => {
                    console.log("Hello");
                    return "Hello";
                };
            `),
        }),
        role: roleForlambdatest.arn,
        handler: "index.handler",
        runtime: "nodejs16.x",
    });

        // create another lambda function
        const testLambda2 = new aws.lambda.Function("testLambda2", {
            code: new pulumi.asset.AssetArchive({
                "index.js": new pulumi.asset.StringAsset(`
                    exports.handler = async (event) => {
                        conssole.log("World");
                        return "World";
                    };
                `),
            }),
            role: roleForlambdatest.arn,
            handler: "index.handler",
            runtime: "nodejs16.x",
        });


// create a role for the state machine
const roleForSfntest = new aws.iam.Role("roleForSfn", {
    name: "roleForSfntest",
    // create a assumerole policy which allows sfn to assume this role
    assumeRolePolicy: JSON.stringify({
        "Version": "2012-10-17",
        "Statement": [
            {
                "Effect": "Allow",
                "Principal": {
                    "Service": "states.amazonaws.com"
                },
                "Action": "sts:AssumeRole"
            }
        ]
    }),
    // create a inline policy which allows sfn to invoke lambda function
    inlinePolicies: [
        {
            name: "sfn_policy",
            policy: JSON.stringify({
                "Version": "2012-10-17",
                "Statement": [
                    {
                        "Effect": "Allow",
                        "Action": [
                            "logs:CreateLogDelivery",
                            "logs:GetLogDelivery",
                            "logs:UpdateLogDelivery",
                            "logs:DeleteLogDelivery",
                            "logs:ListLogDeliveries",
                            "logs:PutResourcePolicy",
                            "logs:DescribeResourcePolicies",
                            "logs:DescribeLogGroups"
                        ],
                        "Resource": "*"
                    },
                    {
                        "Effect": "Allow",
                        "Action": "lambda:*",
                        "Resource": "*"
                    },
                    {
                        "Effect": "Allow",
                        "Action": "sns:*",
                        "Resource": "*"
                    },
                    {
                        "Effect": "Allow",
                        "Action": [
                            "xray:PutTraceSegments",
                            "xray:PutTelemetryRecords",
                            "xray:GetSamplingRules",
                            "xray:GetSamplingTargets"
                        ],
                        "Resource": [
                            "*"
                        ]
                    },
                    // allow sfn to create log group and log stream
                    {
                        "Effect": "Allow",
                        "Action": [
                            "logs:CreateLogGroup",
                            "logs:CreateLogStream",
                            "logs:PutLogEvents"
                        ],
                        "Resource": [
                            "*"
                        ]
                    }
                ]
            }),
        },
    ],
});

// create a cloudwatch log group for the state machine
const SfnlogGroup = new aws.cloudwatch.LogGroup("sfnStateMachine2", {
    name: "/aws/vendedlogs/states/sfnStateMachine2-Logs",
    
});




// create a state machine
const sfnStateMachine = new aws.sfn.StateMachine("sfnStateMachine", {
    roleArn: roleForSfntest.arn,
    name: "sfnStateMachine2",
    definition: pulumi.all([testLambda.arn, testLambda2.arn]).apply (([testLambda, testLambda2]) => JSON.stringify(
        {
            "Comment": "A Hello World example of the Amazon States Language using Pass states",
            "StartAt": "ErrorHandler",
            "States": {
              "ErrorHandler": {
                "Type": "Parallel",
                "Branches": [
                  {
                    "StartAt": "Lambda Invoke",
                    "States": {
                      "Lambda Invoke": {
                        "Type": "Task",
                        "Resource": "arn:aws:states:::lambda:invoke",
                        "Parameters": {
                          "Payload.$": "$",
                          "FunctionName": testLambda,
                        },
                        "Retry": [
                          {
                            "ErrorEquals": [
                              "Lambda.ServiceException",
                              "Lambda.AWSLambdaException",
                              "Lambda.SdkClientException",
                              "Lambda.TooManyRequestsException"
                            ],
                            "IntervalSeconds": 2,
                            "MaxAttempts": 6,
                            "BackoffRate": 2
                          }
                        ],
                        "Next": "Lambda Invoke (1)"
                      },
                      "Lambda Invoke (1)": {
                        "Type": "Task",
                        "Resource": "arn:aws:states:::lambda:invoke",
                        "OutputPath": "$.Payload",
                        "Parameters": {
                          "Payload.$": "$",
                          "FunctionName": testLambda2
                        },
                        "Retry": [
                          {
                            "ErrorEquals": [
                              "Lambda.ServiceException",
                              "Lambda.AWSLambdaException",
                              "Lambda.SdkClientException",
                              "Lambda.TooManyRequestsException"
                            ],
                            "IntervalSeconds": 2,
                            "MaxAttempts": 6,
                            "BackoffRate": 2
                          }
                        ],
                        "End": true
                      }
                    }
                  }
                ],
                "Catch": [
                  {
                    "ErrorEquals": [
                      "States.ALL"
                    ],
                    "ResultPath": "$.error",
                    "Next": "Send Failure Message"
                  }
                ],
                "Next": "Job Succeeded"
              },
              "Job Succeeded": {
                "Type": "Succeed"
              },
              "Send Failure Message": {
                "Type": "Fail"
              }
            }
        }
    )),
    // create a log group for the state machine
    loggingConfiguration: {
        logDestination:  SfnlogGroup.arn.apply(arn => `${arn}:*`),
        includeExecutionData: true,
        level: "ALL",
    },
});


// create a sns topic
const userUpdates = new aws.sns.Topic("sendemail2",
    {
        name: "sendemail2",
        displayName: "sendemail2",
    }
);

// create a sns subscription with email address
const userUpdatesSubscription = new aws.sns.TopicSubscription("userUpdatesSubscription", {
    topic: userUpdates.arn,
    protocol: "email",
    endpoint: "peter.chong@one2.cloud",
});


// create a cloudwatch event rule, !!! that is currently a bug here when you push the event rule, you could see the coordination of the event pattern is wrongly place, the detail would at top, that is why this event rule never work!!!
export const console = new aws.cloudwatch.EventRule("console",
    {
        name: "send_error_email",
        description: "send error email when step function error occurs",
        eventPattern: pulumi.all([sfnStateMachine.arn]).apply(([sfnStateMachine]) => JSON.stringify(
            {   
                "source": ["aws.states"],
                "detail-type": ["Step Functions Execution Status Change"],
                "detail": {
                    "status": ["FAILED"],
                    "stateMachineArn": [sfnStateMachine, ""]
                  }
              }
        )),
    },
    
);


// // create a cloudwatch event rule
// export const console = new aws.cloudwatch.EventRule("console",
//     {
//         name: "send_error_email",
//         description: "send error email when step function error occurs",
//         eventPattern: JSON.stringify(
//             {   
//                 "source": ["aws.states"],
//                 "detail-type": ["Step Functions Execution Status Change"],
//                 "detail": {
//                     "status": ["FAILED"],
//                     "stateMachineArn": ["arn:aws:states:us-east-1:608671652196:stateMachine:sfnStateMachine2", ""]
//                   }
//               }
//         ),
//     },
// );


// create a sns cloudwatch event target
const sns = new aws.cloudwatch.EventTarget("sns", {
    rule: console.name,
    arn: userUpdates.arn,
});

