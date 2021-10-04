import json
import boto3
import time

client = boto3.client('rds')

def lambda_handler(event, context):
    source_db_cluster_identifier=event['SourceDBClusterIdentifier']
    
    target_db_cluster_identifier=event['TargetDBClusterIdentifier']
    target_db_instance_identifier=event['TargetDBInstanceIdentifier']
    target_db_subnet_group_name=event['TargetDBSubnetGroupName']
    target_db_instance_class=event['TargetDBInstanceClass']
    target_db_engine=event['TargetDBEngine']
    target_vpc_security_group_ids=event['TargetVpcSecurityGroupIds']
    target_db_cluster_parameter_group_name=event['TargetDBClusterParameterGroupName']
    target_db_tags=event['TargetTags']
    port=event['Port']
    
    client.restore_db_cluster_to_point_in_time(
        DBClusterIdentifier=target_db_cluster_identifier,
        RestoreType='copy-on-write',
        SourceDBClusterIdentifier=source_db_cluster_identifier,
        UseLatestRestorableTime=True,
        Port=port,
        DBSubnetGroupName=target_db_subnet_group_name,
        VpcSecurityGroupIds=target_vpc_security_group_ids,
        Tags=target_db_tags,
        EnableIAMDatabaseAuthentication=False,
        DBClusterParameterGroupName=target_db_cluster_parameter_group_name,
        DeletionProtection=False,
        CopyTagsToSnapshot=True,
    )
    
    client.create_db_instance(
        DBInstanceIdentifier=target_db_instance_identifier,
        Engine=target_db_engine,
        DBInstanceClass=target_db_instance_class,
        DBClusterIdentifier=target_db_cluster_identifier,
    )
    
    return {
        'message': 'Clone will be available in a few minutes...'
    }

