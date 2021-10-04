import boto3

client = boto3.client('rds')

def lambda_handler(event, context):
    
    target_db_cluster_identifier=event['TargetDBClusterIdentifier']
    
    payload = event.copy()
    
    try:
        response = client.describe_db_clusters(DBClusterIdentifier=target_db_cluster_identifier)
        
        payload['status'] = response['DBClusters'][0]['Status']
    
        return payload
        
    except client.exceptions.DBClusterNotFoundFault as e:
        print(e)
        
        payload['status'] = 'not-found'
        payload['message'] = 'There is no cluster to remove...'
        
        return payload
