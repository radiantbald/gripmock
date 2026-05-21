Local TLS certificates for development only.

This directory is intentionally gitignored (except this file).
Do not commit generated certificates or private keys.

Expected files (generated locally):
- ca.crt
- ca.key
- server.crt
- server.key
- client.crt
- client.key

Server env variables (gripmock):
- GRPC_TLS_CERT_FILE=.../certs/gripmock-local/server.crt
- GRPC_TLS_KEY_FILE=.../certs/gripmock-local/server.key

Optional mTLS on server:
- GRPC_TLS_CLIENT_AUTH=true
- GRPC_TLS_CA_FILE=.../certs/gripmock-local/ca.crt

Client setup:
- Trust ca.crt
- For mTLS, provide client.crt + client.key
