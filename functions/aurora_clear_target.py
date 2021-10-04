import boto3

client = boto3.client('rds')

def lambda_handler(event, context):
    
    target_db_cluster_identifier=event['TargetDBClusterIdentifier']
    target_db_instance_identifier=event['TargetDBInstanceIdentifier']
    
    client.delete_db_instance(
        DBInstanceIdentifier=target_db_instance_identifier,
        SkipFinalSnapshot=True,
        DeleteAutomatedBackups=True
    )
    
    client.delete_db_cluster(
        DBClusterIdentifier=target_db_cluster_identifier,
        SkipFinalSnapshot=True,
    )
    
    return {
        'message': 'Deleting DB Cluster and Instance...'
    }
