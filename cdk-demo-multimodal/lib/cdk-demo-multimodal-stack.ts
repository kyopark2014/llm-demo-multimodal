import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as path from "path";
import * as iam from 'aws-cdk-lib/aws-iam';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cloudFront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as apiGateway from 'aws-cdk-lib/aws-apigateway';
import * as s3Deploy from "aws-cdk-lib/aws-s3-deployment";
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as apigatewayv2 from 'aws-cdk-lib/aws-apigatewayv2';
import * as elasticache from 'aws-cdk-lib/aws-elasticache';
import * as ec2 from "aws-cdk-lib/aws-ec2";

const region = process.env.CDK_DEFAULT_REGION;    
const debug = false;
const stage = 'dev';
const s3_prefix = 'docs';
const projectName = `demo-multimodal`; 

const bucketName = `storage-for-${projectName}-${region}`; 
const bedrock_region = "us-east-1";  // "us-east-1" "us-west-2" 

const claude3_sonnet = [
  {
    "bedrock_region": "us-west-2", // Oregon
    "model_type": "claude3",
    "model_id": "anthropic.claude-3-sonnet-20240229-v1:0",   
    "maxOutputTokens": "8196"
  },
  {
    "bedrock_region": "us-east-1", // N.Virginia
    "model_type": "claude3",
    "model_id": "anthropic.claude-3-sonnet-20240229-v1:0",
    "maxOutputTokens": "8196"
  }
];

const claude3_haiku = [
  {
    "bedrock_region": "us-west-2", // Oregon
    "model_type": "claude3",
    "model_id": "anthropic.claude-3-haiku-20240307-v1:0",   
    "maxOutputTokens": "8196"
  },
  {
    "bedrock_region": "us-east-1", // N.Virginia
    "model_type": "claude3",
    "model_id": "anthropic.claude-3-haiku-20240307-v1:0",
    "maxOutputTokens": "8196"
  }
];

const claude_instant = [
  {
    "bedrock_region": "us-west-2", // Oregon
    "model_type": "claude",
    "model_id": "anthropic.claude-instant-v1",
    "maxOutputTokens": "8196"
  },
  {
    "bedrock_region": "us-east-1", // N.Virginia
    "model_type": "claude",
    "model_id": "anthropic.claude-instant-v1",
    "maxOutputTokens": "8196"
  },
  {
    "bedrock_region": "ap-northeast-1", // Tokyo
    "model_type": "claude",
    "model_id": "anthropic.claude-instant-v1",
    "maxOutputTokens": "8196"
  },    
  {
    "bedrock_region": "eu-central-1", // Europe (Frankfurt)
    "model_type": "claude",
    "model_id": "anthropic.claude-instant-v1",
    "maxOutputTokens": "8196"
    },
];

const claude2 = [
  {
    "bedrock_region": "us-west-2", // Oregon
    "model_type": "claude",
    "model_id": "anthropic.claude-v2:1",   
    "maxOutputTokens": "8196"
  },
  {
    "bedrock_region": "us-east-1", // N.Virginia
    "model_type": "claude",
    "model_id": "anthropic.claude-v2:1",
    "maxOutputTokens": "8196"
  }
];

const profile_of_LLMs = claude3_sonnet;

export class CdkDemoMultimodalStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // s3 
    const s3Bucket = new s3.Bucket(this, `storage-${projectName}`,{
      //bucketName: bucketName,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      publicReadAccess: false,
      versioned: false,
      cors: [
        {
          allowedHeaders: ['*'],
          allowedMethods: [
            s3.HttpMethods.POST,
            s3.HttpMethods.PUT,
          ],
          allowedOrigins: ['*'],
        },
      ],
    });
    if(debug) {
      new cdk.CfnOutput(this, 'bucketName', {
        value: s3Bucket.bucketName,
        description: 'The nmae of bucket',
      });
      new cdk.CfnOutput(this, 's3Arn', {
        value: s3Bucket.bucketArn,
        description: 'The arn of s3',
      });
      new cdk.CfnOutput(this, 's3Path', {
        value: 's3://'+s3Bucket.bucketName,
        description: 'The path of s3',
      });
    }

    // DynamoDB for call log
    const callLogTableName = `db-call-log-for-${projectName}`;
    const callLogDataTable = new dynamodb.Table(this, `db-call-log-for-${projectName}`, {
      tableName: callLogTableName,
      partitionKey: { name: 'user_id', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'request_time', type: dynamodb.AttributeType.STRING }, 
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });
    const callLogIndexName = `index-type-for-${projectName}`;
    callLogDataTable.addGlobalSecondaryIndex({ // GSI
      indexName: callLogIndexName,
      partitionKey: { name: 'request_id', type: dynamodb.AttributeType.STRING },
    });

    // copy web application files into s3 bucket
    new s3Deploy.BucketDeployment(this, `upload-HTML-for-${projectName}`, {
      sources: [s3Deploy.Source.asset("../html/")],
      destinationBucket: s3Bucket,
    });

    new cdk.CfnOutput(this, 'HtmlUpdateCommend', {
      value: 'aws s3 cp ../html/ ' + 's3://' + s3Bucket.bucketName + '/ --recursive',
      description: 'copy commend for web pages',
    });

    // cloudfront
    const distribution = new cloudFront.Distribution(this, `cloudfront-for-${projectName}`, {
      defaultBehavior: {
        origin: new origins.S3Origin(s3Bucket),
        allowedMethods: cloudFront.AllowedMethods.ALLOW_ALL,
        cachePolicy: cloudFront.CachePolicy.CACHING_DISABLED,
        viewerProtocolPolicy: cloudFront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      },
      priceClass: cloudFront.PriceClass.PRICE_CLASS_200,  
    });
    new cdk.CfnOutput(this, `distributionDomainName-for-${projectName}`, {
      value: distribution.domainName,
      description: 'The domain name of the Distribution',
    });

    const vpc = new ec2.Vpc(this, `vpc-for-${projectName}`, {
      maxAzs: 3,
      cidr: "10.32.0.0/24",
      natGateways: 1,
      subnetConfiguration: [
        {
          name: `public-subnet-for-${projectName}`,
          subnetType: ec2.SubnetType.PUBLIC
        },
        {
          name: `private-subnet-for-${projectName}`,
          subnetType: ec2.SubnetType.PRIVATE_ISOLATED
        },
      ],
    });

    const redisSubnetGroup = new elasticache.CfnSubnetGroup(
      this,`redis-subnet-group-for-${projectName}`,
      {
        description: "Subnet group for the redis cluster",
        subnetIds: vpc.publicSubnets.map((ps) => ps.subnetId),
        cacheSubnetGroupName: "Redis-Subnet-Group",
      }
    );

    const redisSecurityGroup = new ec2.SecurityGroup(
      this, `redis-security-group-for-${projectName}`,
      {
        vpc: vpc,
        allowAllOutbound: true,
        description: "Security group for the redis cluster",
      }
    );

    // Redis
    const redisCache = new elasticache.CfnCacheCluster(this, `redis-for-${projectName}`, {
      engine: 'redis',
      cacheNodeType: 'cache.t3.small',
      numCacheNodes: 1,
      clusterName: `redis-for-${projectName}`,
      vpcSecurityGroupIds: [redisSecurityGroup.securityGroupId],
      cacheSubnetGroupName: redisSubnetGroup.ref,
      engineVersion: "6.2",

      
      // the properties below are optional
    /*  autoMinorVersionUpgrade: false,
      cacheParameterGroupName: 'cacheParameterGroupName',
      cacheSecurityGroupNames: ['cacheSecurityGroupNames'],
      engineVersion: 'engineVersion',
      ipDiscovery: 'ipDiscovery',
      logDeliveryConfigurations: [{
        destinationDetails: {
          cloudWatchLogsDetails: {
            logGroup: 'logGroup',
          },
          kinesisFirehoseDetails: {
            deliveryStream: 'deliveryStream',
          },
        },
        destinationType: 'destinationType',
        logFormat: 'logFormat',
        logType: 'logType',
      }],
      networkType: 'networkType',
      notificationTopicArn: 'notificationTopicArn',
      port: 123,
      preferredAvailabilityZone: 'preferredAvailabilityZone',
      preferredAvailabilityZones: ['preferredAvailabilityZones'],
      preferredMaintenanceWindow: 'preferredMaintenanceWindow',
      snapshotArns: ['snapshotArns'],
      snapshotName: 'snapshotName',
      snapshotRetentionLimit: 123,
      snapshotWindow: 'snapshotWindow',
      tags: [{
        key: 'key',
        value: 'value',
      }],
      transitEncryptionEnabled: false, */
      
    });
    
    redisCache.addDependsOn(redisSubnetGroup);
    new cdk.CfnOutput(this, `CacheEndpointUrl-for-${projectName}`, {
      value: redisCache.attrRedisEndpointAddress,
    });

    new cdk.CfnOutput(this, `CachePort-for-${projectName}`, {
      value: redisCache.attrRedisEndpointPort,
    });

    // Lambda (chat) - Role
    const roleLambda = new iam.Role(this, `role-lambda-chat-for-${projectName}`, {
      roleName: `role-lambda-chat-for-${projectName}-${region}`,
      assumedBy: new iam.CompositePrincipal(
        new iam.ServicePrincipal("lambda.amazonaws.com"),
        new iam.ServicePrincipal("bedrock.amazonaws.com"),
      )
    });
    roleLambda.addManagedPolicy({
      managedPolicyArn: 'arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole',
    });
    const BedrockPolicy = new iam.PolicyStatement({  // policy statement for sagemaker
      resources: ['*'],
      actions: ['bedrock:*'],
    });        
    roleLambda.attachInlinePolicy( // add bedrock policy
      new iam.Policy(this, `bedrock-policy-lambda-chat-for-${projectName}`, {
        statements: [BedrockPolicy],
      }),
    );      
    
    // role
    const role = new iam.Role(this, `api-role-for-${projectName}`, {
      roleName: `api-role-for-${projectName}-${region}`,
      assumedBy: new iam.ServicePrincipal("apigateway.amazonaws.com")
    });
    role.addToPolicy(new iam.PolicyStatement({
      resources: ['*'],
      actions: [
        'lambda:InvokeFunction',
        'cloudwatch:*'
      ]
    }));
    role.addManagedPolicy({
      managedPolicyArn: 'arn:aws:iam::aws:policy/AWSLambdaExecute',
    }); 

    // API Gateway
    const api = new apiGateway.RestApi(this, `api-chatbot-for-${projectName}`, {
      description: 'API Gateway for chatbot',
      endpointTypes: [apiGateway.EndpointType.REGIONAL],
      restApiName: 'rest-api-for-'+projectName,      
      binaryMediaTypes: ['application/pdf', 'text/plain', 'text/csv', 'image/png', 'image/jpeg'], 
      deployOptions: {
        stageName: stage,

        // logging for debug
        // loggingLevel: apiGateway.MethodLoggingLevel.INFO, 
        // dataTraceEnabled: true,
      },
    });  
    
    // cloudfront setting 
    distribution.addBehavior("/chat", new origins.RestApiOrigin(api), {
      cachePolicy: cloudFront.CachePolicy.CACHING_DISABLED,
      allowedMethods: cloudFront.AllowedMethods.ALLOW_ALL,  
      viewerProtocolPolicy: cloudFront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
    });    
   
    new cdk.CfnOutput(this, `WebUrl-for-${projectName}`, {
      value: 'https://'+distribution.domainName+'/index.html',      
      description: 'The web url of request for chat',
    });

    // Lambda - Upload
    const lambdaUpload = new lambda.Function(this, `lambda-upload-for-${projectName}`, {
      runtime: lambda.Runtime.NODEJS_16_X, 
      functionName: `lambda-upload-for-${projectName}`,
      code: lambda.Code.fromAsset("../lambda-upload"), 
      handler: "index.handler", 
      timeout: cdk.Duration.seconds(10),
      environment: {
        bucketName: s3Bucket.bucketName,
        s3_prefix:  s3_prefix
      }      
    });
    s3Bucket.grantReadWrite(lambdaUpload);
    
    // POST method - upload
    const resourceName = "upload";
    const upload = api.root.addResource(resourceName);
    upload.addMethod('POST', new apiGateway.LambdaIntegration(lambdaUpload, {
      passthroughBehavior: apiGateway.PassthroughBehavior.WHEN_NO_TEMPLATES,
      credentialsRole: role,
      integrationResponses: [{
        statusCode: '200',
      }], 
      proxy:false, 
    }), {
      methodResponses: [  
        {
          statusCode: '200',
          responseModels: {
            'application/json': apiGateway.Model.EMPTY_MODEL,
          }, 
        }
      ]
    }); 
    if(debug) {
      new cdk.CfnOutput(this, `ApiGatewayUrl-for-${projectName}`, {
        value: api.url+'upload',
        description: 'The url of API Gateway',
      }); 
    }

    // cloudfront setting  
    distribution.addBehavior("/upload", new origins.RestApiOrigin(api), {
      cachePolicy: cloudFront.CachePolicy.CACHING_DISABLED,
      allowedMethods: cloudFront.AllowedMethods.ALLOW_ALL,  
      viewerProtocolPolicy: cloudFront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
    });    

    // Lambda - queryResult
    const lambdaQueryResult = new lambda.Function(this, `lambda-query-for-${projectName}`, {
      runtime: lambda.Runtime.NODEJS_16_X, 
      functionName: `lambda-query-for-${projectName}`,
      code: lambda.Code.fromAsset("../lambda-query"), 
      handler: "index.handler", 
      timeout: cdk.Duration.seconds(60),
      environment: {
        tableName: callLogTableName,
        indexName: callLogIndexName
      }      
    });
    callLogDataTable.grantReadWriteData(lambdaQueryResult); // permission for dynamo
    
    // POST method - query
    const query = api.root.addResource("query");
    query.addMethod('POST', new apiGateway.LambdaIntegration(lambdaQueryResult, {
      passthroughBehavior: apiGateway.PassthroughBehavior.WHEN_NO_TEMPLATES,
      credentialsRole: role,
      integrationResponses: [{
        statusCode: '200',
      }], 
      proxy:false, 
    }), {
      methodResponses: [  
        {
          statusCode: '200',
          responseModels: {
            'application/json': apiGateway.Model.EMPTY_MODEL,
          }, 
        }
      ]
    }); 

    // cloudfront setting for api gateway    
    distribution.addBehavior("/query", new origins.RestApiOrigin(api), {
      cachePolicy: cloudFront.CachePolicy.CACHING_DISABLED,
      allowedMethods: cloudFront.AllowedMethods.ALLOW_ALL,  
      viewerProtocolPolicy: cloudFront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
    });

    // Lambda - getHistory
    const lambdaGetHistory = new lambda.Function(this, `lambda-gethistory-for-${projectName}`, {
      runtime: lambda.Runtime.NODEJS_16_X, 
      functionName: `lambda-gethistory-for-${projectName}`,
      code: lambda.Code.fromAsset("../lambda-gethistory"), 
      handler: "index.handler", 
      timeout: cdk.Duration.seconds(60),
      environment: {
        tableName: callLogTableName
      }      
    });
    callLogDataTable.grantReadWriteData(lambdaGetHistory); // permission for dynamo
    
    // POST method - history
    const history = api.root.addResource("history");
    history.addMethod('POST', new apiGateway.LambdaIntegration(lambdaGetHistory, {
      passthroughBehavior: apiGateway.PassthroughBehavior.WHEN_NO_TEMPLATES,
      credentialsRole: role,
      integrationResponses: [{
        statusCode: '200',
      }], 
      proxy:false, 
    }), {
      methodResponses: [  
        {
          statusCode: '200',
          responseModels: {
            'application/json': apiGateway.Model.EMPTY_MODEL,
          }, 
        }
      ]
    }); 

    // cloudfront setting for api gateway    
    distribution.addBehavior("/history", new origins.RestApiOrigin(api), {
      cachePolicy: cloudFront.CachePolicy.CACHING_DISABLED,
      allowedMethods: cloudFront.AllowedMethods.ALLOW_ALL,  
      viewerProtocolPolicy: cloudFront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
    });

    // Lambda - deleteItems
    const lambdaDeleteItems = new lambda.Function(this, `lambda-deleteItems-for-${projectName}`, {
      runtime: lambda.Runtime.NODEJS_16_X, 
      functionName: `lambda-deleteItems-for-${projectName}`,
      code: lambda.Code.fromAsset("../lambda-delete-items"), 
      handler: "index.handler", 
      timeout: cdk.Duration.seconds(60),
      environment: {
        tableName: callLogTableName
      }      
    });
    callLogDataTable.grantReadWriteData(lambdaDeleteItems); // permission for dynamo
    
    // POST method - delete items
    const deleteItem = api.root.addResource("delete");
    deleteItem.addMethod('POST', new apiGateway.LambdaIntegration(lambdaDeleteItems, {
      passthroughBehavior: apiGateway.PassthroughBehavior.WHEN_NO_TEMPLATES,
      credentialsRole: role,
      integrationResponses: [{
        statusCode: '200',
      }], 
      proxy:false, 
    }), {
      methodResponses: [  
        {
          statusCode: '200',
          responseModels: {
            'application/json': apiGateway.Model.EMPTY_MODEL,
          }, 
        }
      ]
    }); 

    // cloudfront setting for api gateway    
    distribution.addBehavior("/delete", new origins.RestApiOrigin(api), {
      cachePolicy: cloudFront.CachePolicy.CACHING_DISABLED,
      allowedMethods: cloudFront.AllowedMethods.ALLOW_ALL,  
      viewerProtocolPolicy: cloudFront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
    });

    // stream api gateway
    // API Gateway
    const websocketapi = new apigatewayv2.CfnApi(this, `ws-api-for-${projectName}`, {
      description: 'API Gateway for chatbot using websocket',
      apiKeySelectionExpression: "$request.header.x-api-key",
      name: 'ws-api-for-'+projectName,
      protocolType: "WEBSOCKET", // WEBSOCKET or HTTP
      routeSelectionExpression: "$request.body.action",     
    });  
    websocketapi.applyRemovalPolicy(cdk.RemovalPolicy.DESTROY); // DESTROY, RETAIN

    new cdk.CfnOutput(this, 'api-identifier', {
      value: websocketapi.attrApiId,
      description: 'The API identifier.',
    });

    const wss_url = `wss://${websocketapi.attrApiId}.execute-api.${region}.amazonaws.com/${stage}`;
    new cdk.CfnOutput(this, 'web-socket-url', {
      value: wss_url,
      
      description: 'The URL of Web Socket',
    });

    const connection_url = `https://${websocketapi.attrApiId}.execute-api.${region}.amazonaws.com/${stage}`;
    new cdk.CfnOutput(this, 'connection-url', {
      value: connection_url,
      
      description: 'The URL of connection',
    });

    // Lambda - chat (websocket)
    const roleLambdaWebsocket = new iam.Role(this, `role-lambda-chat-ws-for-${projectName}`, {
      roleName: `role-lambda-chat-ws-for-${projectName}-${region}`,
      assumedBy: new iam.CompositePrincipal(
        new iam.ServicePrincipal("lambda.amazonaws.com"),
        new iam.ServicePrincipal("bedrock.amazonaws.com"),
      )
    });
    roleLambdaWebsocket.addManagedPolicy({
      managedPolicyArn: 'arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole',
    });
    roleLambdaWebsocket.attachInlinePolicy( // add bedrock policy
      new iam.Policy(this, `bedrock-policy-lambda-chat-ws-for-${projectName}`, {
        statements: [BedrockPolicy],
      }),
    );        

    const apiInvokePolicy = new iam.PolicyStatement({ 
      // resources: ['arn:aws:execute-api:*:*:*'],
      resources: ['*'],
      actions: [
        'execute-api:Invoke',
        'execute-api:ManageConnections'
      ],
    });        
    roleLambdaWebsocket.attachInlinePolicy( 
      new iam.Policy(this, `api-invoke-policy-for-${projectName}`, {
        statements: [apiInvokePolicy],
      }),
    );  

    const lambdaChatWebsocket = new lambda.DockerImageFunction(this, `lambda-chat-ws-for-${projectName}`, {
      description: 'lambda for chat using websocket',
      functionName: `lambda-chat-ws-for-${projectName}`,
      code: lambda.DockerImageCode.fromImageAsset(path.join(__dirname, '../../lambda-chat-ws')),
      timeout: cdk.Duration.seconds(300),
      role: roleLambdaWebsocket,
      environment: {
        bedrock_region: bedrock_region,
        s3_bucket: s3Bucket.bucketName,
        s3_prefix: s3_prefix,
        path: 'https://'+distribution.domainName+'/',   
        callLogTableName: callLogTableName,
        connection_url: connection_url,
        profile_of_LLMs:JSON.stringify(claude3_haiku),
      }
    });     
    lambdaChatWebsocket.grantInvoke(new iam.ServicePrincipal('apigateway.amazonaws.com'));  
    s3Bucket.grantRead(lambdaChatWebsocket); // permission for s3
    callLogDataTable.grantReadWriteData(lambdaChatWebsocket); // permission for dynamo 
    
    new cdk.CfnOutput(this, 'function-chat-ws-arn', {
      value: lambdaChatWebsocket.functionArn,
      description: 'The arn of lambda webchat.',
    }); 

    // Lambda - greeting
    const lambdaGreeting = new lambda.DockerImageFunction(this, `lambda-greeting-for-${projectName}`, {
      description: 'lambda for greeting',
      functionName: `lambda-greeting-for-${projectName}`,
      code: lambda.DockerImageCode.fromImageAsset(path.join(__dirname, '../../lambda-greeting')),
      timeout: cdk.Duration.seconds(60),
      role: roleLambda,
      environment: {
        s3_bucket: bucketName,
        profile_of_LLMs:JSON.stringify(claude3_sonnet),
      }
    });     
  
    // POST method - greeting
    const greeting = api.root.addResource("greeting");
    greeting.addMethod('POST', new apiGateway.LambdaIntegration(lambdaGreeting, {
        passthroughBehavior: apiGateway.PassthroughBehavior.WHEN_NO_TEMPLATES,
        credentialsRole: role,
        integrationResponses: [{
            statusCode: '200',
        }],
        proxy: true,
    }), {
        methodResponses: [
            {
                statusCode: '200',
                responseModels: {
                    'application/json': apiGateway.Model.EMPTY_MODEL,
                },
            }
        ]
    });
    
    distribution.addBehavior("/greeting", new origins.RestApiOrigin(api), {
        cachePolicy: cloudFront.CachePolicy.CACHING_DISABLED,
        allowedMethods: cloudFront.AllowedMethods.ALLOW_ALL,
        viewerProtocolPolicy: cloudFront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
    });
    s3Bucket.grantReadWrite(lambdaGreeting);

    // Lambda - reading
    const lambdaReading = new lambda.DockerImageFunction(this, `lambda-reading-for-${projectName}`, {
      description: 'lambda for reading',
      functionName: `lambda-reading-for-${projectName}`,
      code: lambda.DockerImageCode.fromImageAsset(path.join(__dirname, '../../lambda-reading')),
      timeout: cdk.Duration.seconds(60),
      role: roleLambda,
      environment: {
        s3_bucket: bucketName,
        profile_of_LLMs:JSON.stringify(claude3_sonnet),
      }
    });     
  
    // POST method - reading
    const reading = api.root.addResource("reading");
    reading.addMethod('POST', new apiGateway.LambdaIntegration(lambdaReading, {
        passthroughBehavior: apiGateway.PassthroughBehavior.WHEN_NO_TEMPLATES,
        credentialsRole: role,
        integrationResponses: [{
            statusCode: '200',
        }],
        proxy: true,
    }), {
        methodResponses: [
            {
                statusCode: '200',
                responseModels: {
                    'application/json': apiGateway.Model.EMPTY_MODEL,
                },
            }
        ]
    });
    
    distribution.addBehavior("/reading", new origins.RestApiOrigin(api), {
        cachePolicy: cloudFront.CachePolicy.CACHING_DISABLED,
        allowedMethods: cloudFront.AllowedMethods.ALLOW_ALL,
        viewerProtocolPolicy: cloudFront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
    });
    s3Bucket.grantReadWrite(lambdaReading);

    // Lambda - translation
    const lambdaTranslation = new lambda.DockerImageFunction(this, `lambda-translation-for-${projectName}`, {
      description: 'lambda for translation',
      functionName: `lambda-translation-for-${projectName}`,
      code: lambda.DockerImageCode.fromImageAsset(path.join(__dirname, '../../lambda-translation')),
      timeout: cdk.Duration.seconds(60),
      role: roleLambda,
      environment: {
        s3_bucket: bucketName,
        profile_of_LLMs:JSON.stringify(claude3_sonnet),
      }
    });     
  
    // POST method - translation
    const translation = api.root.addResource("translation");
    translation.addMethod('POST', new apiGateway.LambdaIntegration(lambdaTranslation, {
        passthroughBehavior: apiGateway.PassthroughBehavior.WHEN_NO_TEMPLATES,
        credentialsRole: role,
        integrationResponses: [{
            statusCode: '200',
        }],
        proxy: true,
    }), {
        methodResponses: [
            {
                statusCode: '200',
                responseModels: {
                    'application/json': apiGateway.Model.EMPTY_MODEL,
                },
            }
        ]
    });
    
    distribution.addBehavior("/translation", new origins.RestApiOrigin(api), {
        cachePolicy: cloudFront.CachePolicy.CACHING_DISABLED,
        allowedMethods: cloudFront.AllowedMethods.ALLOW_ALL,
        viewerProtocolPolicy: cloudFront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
    });
    s3Bucket.grantReadWrite(lambdaTranslation);

    // Lambda - gesture
    const lambdaGesture = new lambda.DockerImageFunction(this, `lambda-gesture-for-${projectName}`, {
      description: 'lambda for gesture',
      functionName: `lambda-gesture-for-${projectName}`,
      code: lambda.DockerImageCode.fromImageAsset(path.join(__dirname, '../../lambda-gesture')),
      timeout: cdk.Duration.seconds(60),
      role: roleLambda,
      environment: {
        s3_bucket: bucketName,
        profile_of_LLMs:JSON.stringify(claude3_sonnet),
      }
    });     
  
    // POST method - gesture
    const gesture = api.root.addResource("gesture");
    gesture.addMethod('POST', new apiGateway.LambdaIntegration(lambdaGesture, {
        passthroughBehavior: apiGateway.PassthroughBehavior.WHEN_NO_TEMPLATES,
        credentialsRole: role,
        integrationResponses: [{
            statusCode: '200',
        }],
        proxy: true,
    }), {
        methodResponses: [
            {
                statusCode: '200',
                responseModels: {
                    'application/json': apiGateway.Model.EMPTY_MODEL,
                },
            }
        ]
    });
    
    distribution.addBehavior("/gesture", new origins.RestApiOrigin(api), {
        cachePolicy: cloudFront.CachePolicy.CACHING_DISABLED,
        allowedMethods: cloudFront.AllowedMethods.ALLOW_ALL,
        viewerProtocolPolicy: cloudFront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
    });
    s3Bucket.grantReadWrite(lambdaGesture);
    
    const integrationUri = `arn:aws:apigateway:${region}:lambda:path/2015-03-31/functions/${lambdaChatWebsocket.functionArn}/invocations`;    
    const cfnIntegration = new apigatewayv2.CfnIntegration(this, `api-integration-for-${projectName}`, {
      apiId: websocketapi.attrApiId,
      integrationType: 'AWS_PROXY',
      credentialsArn: role.roleArn,
      connectionType: 'INTERNET',
      description: 'Integration for connect',
      integrationUri: integrationUri,
    });  

    new apigatewayv2.CfnRoute(this, `api-route-for-${projectName}-connect`, {
      apiId: websocketapi.attrApiId,
      routeKey: "$connect", 
      apiKeyRequired: false,
      authorizationType: "NONE",
      operationName: 'connect',
      target: `integrations/${cfnIntegration.ref}`,      
    }); 

    new apigatewayv2.CfnRoute(this, `api-route-for-${projectName}-disconnect`, {
      apiId: websocketapi.attrApiId,
      routeKey: "$disconnect", 
      apiKeyRequired: false,
      authorizationType: "NONE",
      operationName: 'disconnect',
      target: `integrations/${cfnIntegration.ref}`,      
    }); 

    new apigatewayv2.CfnRoute(this, `api-route-for-${projectName}-default`, {
      apiId: websocketapi.attrApiId,
      routeKey: "$default", 
      apiKeyRequired: false,
      authorizationType: "NONE",
      operationName: 'default',
      target: `integrations/${cfnIntegration.ref}`,      
    }); 

    new apigatewayv2.CfnStage(this, `api-stage-for-${projectName}`, {
      apiId: websocketapi.attrApiId,
      stageName: stage
    }); 

    // lambda - provisioning
    const lambdaProvisioning = new lambda.Function(this, `lambda-provisioning-for-${projectName}`, {
      description: 'lambda to earn provisioning info',
      functionName: `lambda-provisioning-api-${projectName}`,
      handler: 'lambda_function.lambda_handler',
      runtime: lambda.Runtime.PYTHON_3_11,
      code: lambda.Code.fromAsset(path.join(__dirname, '../../lambda-provisioning')),
      timeout: cdk.Duration.seconds(30),
      environment: {
        wss_url: wss_url,
      }
    });

    // POST method - provisioning
    const provisioning_info = api.root.addResource("provisioning");
    provisioning_info.addMethod('POST', new apiGateway.LambdaIntegration(lambdaProvisioning, {
      passthroughBehavior: apiGateway.PassthroughBehavior.WHEN_NO_TEMPLATES,
      credentialsRole: role,
      integrationResponses: [{
        statusCode: '200',
      }], 
      proxy:false, 
    }), {
      methodResponses: [  
        {
          statusCode: '200',
          responseModels: {
            'application/json': apiGateway.Model.EMPTY_MODEL,
          }, 
        }
      ]
    }); 

    // cloudfront setting for provisioning api
    distribution.addBehavior("/provisioning", new origins.RestApiOrigin(api), {
      cachePolicy: cloudFront.CachePolicy.CACHING_DISABLED,
      allowedMethods: cloudFront.AllowedMethods.ALLOW_ALL,  
      viewerProtocolPolicy: cloudFront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
    });

    // deploy components
    new componentDeployment(scope, `deployment-for-${projectName}`, websocketapi.attrApiId)       
  }
}

export class componentDeployment extends cdk.Stack {
  constructor(scope: Construct, id: string, appId: string, props?: cdk.StackProps) {    
    super(scope, id, props);

    new apigatewayv2.CfnDeployment(this, `api-deployment-for-${projectName}`, {
      apiId: appId,
      description: "deploy api gateway using websocker",  // $default
      stageName: stage
    });   
  }
} 
