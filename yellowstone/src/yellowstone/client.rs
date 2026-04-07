use std::time::Duration;
use tonic::{codec::CompressionEncoding, transport::ClientTlsConfig};
use yellowstone_grpc_client::{GeyserGrpcBuilderError, GeyserGrpcClient, Interceptor};

pub async fn connect(
    endpoint: &str,
    x_token: Option<String>,
) -> Result<GeyserGrpcClient<impl Interceptor>, GeyserGrpcBuilderError> {
    let mut builder = GeyserGrpcClient::build_from_shared(endpoint.to_string())?
        .tls_config(ClientTlsConfig::new().with_native_roots())?
        .connect_timeout(Duration::from_secs(10))
        .http2_adaptive_window(true)
        .initial_connection_window_size(8 * 1024 * 1024)
        .initial_stream_window_size(4 * 1024 * 1024)
        .http2_keep_alive_interval(Duration::from_secs(15))
        .keep_alive_timeout(Duration::from_secs(5))
        .keep_alive_while_idle(true)
        .tcp_keepalive(Some(Duration::from_secs(15)))
        .tcp_nodelay(true)
        .accept_compressed(CompressionEncoding::Zstd)
        .max_decoding_message_size(64 * 1024 * 1024);

    if let Some(token) = x_token {
        builder = builder.x_token(Some(token))?;
    }

    let client = builder.connect().await?;
    Ok(client)
}
