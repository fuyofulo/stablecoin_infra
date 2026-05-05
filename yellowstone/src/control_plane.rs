use chrono::{DateTime, Utc};
use futures::StreamExt;
use reqwest::Client;
use serde::Deserialize;
use std::collections::{HashMap, HashSet};
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::sync::Mutex;

#[derive(Clone)]
pub struct ControlPlaneClient {
    client: Client,
    base_url: String,
    service_token: Option<String>,
}

impl ControlPlaneClient {
    pub fn new(base_url: String, service_token: Option<String>) -> Self {
        Self {
            // No default timeout: `GET /internal/matching-index/events` is a long-lived SSE
            // stream. A client-wide timeout applies to the entire body and would abort the
            // stream after a few seconds (surfacing as reqwest's generic "error decoding
            // response body"). Short timeouts are set per request where appropriate.
            client: Client::builder()
                .build()
                .expect("control plane client should build"),
            base_url,
            service_token,
        }
    }

    pub async fn fetch_registry(&self) -> Result<OrganizationRegistry, reqwest::Error> {
        let url = format!("{}/internal/matching-index", self.base_url);
        let index = self
            .with_internal_auth(self.client.get(url).timeout(Duration::from_secs(3)))
            .send()
            .await?
            .error_for_status()?
            .json::<MatchingIndexResponse>()
            .await?;

        Ok(OrganizationRegistry::new(index.version, index.organizations))
    }

    async fn connect_matching_index_event_stream(
        &self,
    ) -> Result<reqwest::Response, reqwest::Error> {
        let url = format!("{}/internal/matching-index/events", self.base_url);
        self.with_internal_auth(self.client.get(url))
            .send()
            .await?
            .error_for_status()
    }

    fn with_internal_auth(&self, builder: reqwest::RequestBuilder) -> reqwest::RequestBuilder {
        if let Some(token) = &self.service_token {
            builder.header("x-service-token", token)
        } else {
            builder
        }
    }
}

pub struct OrganizationRegistryCache {
    client: ControlPlaneClient,
    last_refresh_at: Option<Instant>,
    last_refresh_error_log_at: Option<Instant>,
    registry: OrganizationRegistry,
}

impl OrganizationRegistryCache {
    pub fn new(client: ControlPlaneClient) -> Self {
        Self {
            client,
            last_refresh_at: None,
            last_refresh_error_log_at: None,
            registry: OrganizationRegistry::default(),
        }
    }

    pub async fn refresh_now(&mut self) -> Result<(), reqwest::Error> {
        let mut last_error = None;
        for _ in 0..3 {
            match self.client.fetch_registry().await {
                Ok(registry) => {
                    self.registry = registry;
                    self.last_refresh_at = Some(Instant::now());
                    self.last_refresh_error_log_at = None;
                    return Ok(());
                }
                Err(error) => {
                    last_error = Some(error);
                    tokio::time::sleep(Duration::from_millis(150)).await;
                }
            }
        }

        Err(last_error.expect("refresh retry loop should capture error"))
    }

    pub fn should_log_refresh_error(&mut self) -> bool {
        let should_log = self
            .last_refresh_error_log_at
            .map(|logged_at| logged_at.elapsed() >= Duration::from_secs(5))
            .unwrap_or(true);

        if should_log {
            self.last_refresh_error_log_at = Some(Instant::now());
        }

        should_log
    }

    pub fn registry(&self) -> &OrganizationRegistry {
        &self.registry
    }

    pub fn client(&self) -> ControlPlaneClient {
        self.client.clone()
    }
}

#[cfg(test)]
impl OrganizationRegistryCache {
    pub fn with_registry(registry: OrganizationRegistry) -> Self {
        Self {
            client: ControlPlaneClient::new("http://127.0.0.1:0".to_string(), None),
            last_refresh_at: Some(Instant::now()),
            last_refresh_error_log_at: None,
            registry,
        }
    }
}

#[derive(Clone, Default)]
pub struct OrganizationRegistry {
    version: u64,
    organization_matches_by_destination: HashMap<String, Vec<OrganizationPaymentMatch>>,
    watched_addresses: HashSet<String>,
    submitted_signatures: HashSet<String>,
    pending_requests_by_organization_wallet:
        HashMap<String, HashMap<String, Vec<OrganizationTransferRequestMatch>>>,
}

impl OrganizationRegistry {
    fn new(version: u64, raw_snapshots: Vec<OrganizationMatchingSnapshot>) -> Self {
        let mut organization_matches_by_destination: HashMap<String, Vec<OrganizationPaymentMatch>> =
            HashMap::new();
        let mut watched_addresses = HashSet::new();
        let mut submitted_signatures = HashSet::new();
        let mut pending_requests_by_organization_wallet: HashMap<
            String,
            HashMap<String, Vec<OrganizationTransferRequestMatch>>,
        > = HashMap::new();

        for raw_snapshot in raw_snapshots {
            for wallet in &raw_snapshot.treasury_wallets {
                watched_addresses.insert(wallet.address.clone());
                if let Some(usdc_ata_address) = &wallet.usdc_ata_address {
                    watched_addresses.insert(usdc_ata_address.clone());
                }
            }

            for request in &raw_snapshot.matches {
                let destination_wallet_address = request.destination.wallet_address.clone();
                if let Some(submitted_signature) = request
                    .latest_execution
                    .as_ref()
                    .and_then(|execution| execution.submitted_signature.clone())
                {
                    submitted_signatures.insert(submitted_signature);
                }

                let matched = OrganizationPaymentMatch {
                    organization_id: raw_snapshot.organization.organization_id.clone(),
                    #[cfg(test)]
                    wallet_address: destination_wallet_address.clone(),
                };

                organization_matches_by_destination
                    .entry(destination_wallet_address.clone())
                    .or_default()
                    .push(matched);

                let request_match = OrganizationTransferRequestMatch {
                    transfer_request_id: request.transfer_request_id.clone(),
                    amount_raw: request.amount_raw.parse().unwrap_or_default(),
                    requested_at: request.requested_at,
                    request_type: request.request_type.clone(),
                    expected_source_wallet_address: request.expected_source_wallet_address.clone(),
                    submitted_signature: request
                        .latest_execution
                        .as_ref()
                        .and_then(|execution| execution.submitted_signature.clone()),
                    #[cfg(test)]
                    organization_id: raw_snapshot.organization.organization_id.clone(),
                    #[cfg(test)]
                    destination_wallet_address: destination_wallet_address.clone(),
                };

                pending_requests_by_organization_wallet
                    .entry(raw_snapshot.organization.organization_id.clone())
                    .or_default()
                    .entry(destination_wallet_address)
                    .or_default()
                    .push(request_match.clone());
            }
        }

        Self {
            version,
            organization_matches_by_destination,
            watched_addresses,
            submitted_signatures,
            pending_requests_by_organization_wallet,
        }
    }

    pub fn version(&self) -> u64 {
        self.version
    }

    pub fn is_watched_address(&self, address: &str) -> bool {
        self.watched_addresses.contains(address)
    }

    pub fn is_submitted_signature(&self, signature: &str) -> bool {
        self.submitted_signatures.contains(signature)
    }

    pub fn matches_for_destination_wallet(
        &self,
        address: &str,
    ) -> Option<&[OrganizationPaymentMatch]> {
        self.organization_matches_by_destination
            .get(address)
            .map(Vec::as_slice)
    }

    pub fn pending_requests_for_destination_wallet(
        &self,
        organization_id: &str,
        destination_wallet_address: &str,
    ) -> Option<&[OrganizationTransferRequestMatch]> {
        self.pending_requests_by_organization_wallet
            .get(organization_id)
            .and_then(|requests| requests.get(destination_wallet_address))
            .map(Vec::as_slice)
    }
}

#[cfg(test)]
impl OrganizationRegistry {
    pub fn from_matches(matches: Vec<OrganizationPaymentMatch>) -> Self {
        let mut organization_matches_by_destination: HashMap<String, Vec<OrganizationPaymentMatch>> =
            HashMap::new();
        let mut watched_addresses = HashSet::new();

        for matched in matches {
            #[cfg(test)]
            let wallet_address = matched.wallet_address.clone();
            #[cfg(test)]
            watched_addresses.insert(wallet_address.clone());
            organization_matches_by_destination
                .entry(wallet_address)
                .or_default()
                .push(matched);
        }

        Self {
            version: 1,
            organization_matches_by_destination,
            watched_addresses,
            submitted_signatures: HashSet::new(),
            pending_requests_by_organization_wallet: HashMap::new(),
        }
    }

    pub fn with_transfer_requests(
        matches: Vec<OrganizationPaymentMatch>,
        transfer_requests: Vec<OrganizationTransferRequestMatch>,
    ) -> Self {
        let mut registry = Self::from_matches(matches);

        for request in transfer_requests {
            #[cfg(test)]
            let organization_id = request.organization_id.clone();
            #[cfg(test)]
            let destination_wallet_address = request.destination_wallet_address.clone();
            #[cfg(test)]
            registry
                .watched_addresses
                .insert(destination_wallet_address.clone());
            if let Some(submitted_signature) = &request.submitted_signature {
                registry
                    .submitted_signatures
                    .insert(submitted_signature.clone());
            }
            registry
                .pending_requests_by_organization_wallet
                .entry(organization_id)
                .or_default()
                .entry(destination_wallet_address)
                .or_default()
                .push(request);
        }

        registry
    }
}

#[derive(Clone)]
pub struct OrganizationPaymentMatch {
    pub organization_id: String,
    #[cfg(test)]
    pub wallet_address: String,
}

#[derive(Clone)]
pub struct OrganizationTransferRequestMatch {
    pub transfer_request_id: String,
    pub amount_raw: i128,
    pub requested_at: DateTime<Utc>,
    pub request_type: String,
    pub expected_source_wallet_address: Option<String>,
    pub submitted_signature: Option<String>,
    #[cfg(test)]
    pub organization_id: String,
    #[cfg(test)]
    pub destination_wallet_address: String,
}

pub async fn run_matching_index_event_listener(registry_cache: Arc<Mutex<OrganizationRegistryCache>>) {
    let mut reconnect_backoff = Duration::from_secs(1);

    loop {
        let client = {
            let cache = registry_cache.lock().await;
            cache.client()
        };

        let response = match client.connect_matching_index_event_stream().await {
            Ok(response) => response,
            Err(error) => {
                eprintln!(
                    "Matching index event stream failed to connect: {}. Reconnecting in {:?}...",
                    error, reconnect_backoff
                );
                tokio::time::sleep(reconnect_backoff).await;
                reconnect_backoff = (reconnect_backoff * 2).min(Duration::from_secs(15));
                continue;
            }
        };

        reconnect_backoff = Duration::from_secs(1);
        let mut stream = response.bytes_stream();
        let mut buffered = String::new();

        while let Some(chunk) = stream.next().await {
            match chunk {
                Ok(bytes) => {
                    buffered.push_str(&String::from_utf8_lossy(&bytes));
                    while let Some(event_end) = buffered.find("\n\n") {
                        let event = buffered[..event_end].to_string();
                        buffered = buffered[event_end + 2..].to_string();

                        if event
                            .lines()
                            .any(|line| line.starts_with("event: matching_index_"))
                        {
                            let mut cache = registry_cache.lock().await;
                            match cache.refresh_now().await {
                                Ok(()) => {
                                    println!(
                                        "Matching index refreshed to version {}.",
                                        cache.registry().version()
                                    );
                                }
                                Err(error) => {
                                    if cache.should_log_refresh_error() {
                                        eprintln!(
                                            "Matching index refresh after event failed; continuing with last known index: {}",
                                            error
                                        );
                                    }
                                }
                            }
                        }
                    }
                }
                Err(error) => {
                    eprintln!(
                        "Matching index event stream errored: {}. Reconnecting in {:?}...",
                        error, reconnect_backoff
                    );
                    break;
                }
            }
        }

        tokio::time::sleep(reconnect_backoff).await;
        reconnect_backoff = (reconnect_backoff * 2).min(Duration::from_secs(15));
    }
}

#[derive(Deserialize)]
struct MatchingIndexResponse {
    version: u64,
    organizations: Vec<OrganizationMatchingSnapshot>,
}

#[derive(Deserialize)]
struct OrganizationMatchingSnapshot {
    organization: OrganizationView,
    #[serde(rename = "treasuryWallets")]
    treasury_wallets: Vec<TreasuryWalletView>,
    matches: Vec<TransferRequestDetails>,
}

#[derive(Deserialize)]
struct OrganizationView {
    #[serde(rename = "organizationId")]
    organization_id: String,
}

#[derive(Deserialize)]
struct TreasuryWalletView {
    address: String,
    #[serde(rename = "usdcAtaAddress")]
    usdc_ata_address: Option<String>,
}

#[derive(Deserialize)]
struct TransferRequestDetails {
    #[serde(rename = "transferRequestId")]
    transfer_request_id: String,
    #[serde(rename = "requestType")]
    request_type: String,
    #[serde(rename = "expectedSourceWalletAddress")]
    expected_source_wallet_address: Option<String>,
    #[serde(rename = "amountRaw")]
    amount_raw: String,
    #[serde(rename = "requestedAt")]
    requested_at: DateTime<Utc>,
    destination: TransferRequestDestinationDetails,
    #[serde(rename = "latestExecution")]
    latest_execution: Option<TransferRequestExecutionDetails>,
}

#[derive(Deserialize)]
struct TransferRequestDestinationDetails {
    #[serde(rename = "walletAddress")]
    wallet_address: String,
}

#[derive(Deserialize)]
struct TransferRequestExecutionDetails {
    #[serde(rename = "submittedSignature")]
    submitted_signature: Option<String>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn registry_indexes_wallets_and_pending_requests() {
        let registry = OrganizationRegistry::new(
            42,
            vec![OrganizationMatchingSnapshot {
                organization: OrganizationView {
                    organization_id: "organization-1".to_string(),
                },
                treasury_wallets: vec![TreasuryWalletView {
                    address: "SourceWallet111".to_string(),
                    usdc_ata_address: Some("SourceAta111".to_string()),
                }],
                matches: vec![TransferRequestDetails {
                    transfer_request_id: "request-1".to_string(),
                    request_type: "wallet_transfer".to_string(),
                    expected_source_wallet_address: None,
                    amount_raw: "10000".to_string(),
                    requested_at: Utc::now(),
                    destination: TransferRequestDestinationDetails {
                        wallet_address: "Wallet111".to_string(),
                    },
                    latest_execution: Some(TransferRequestExecutionDetails {
                        submitted_signature: Some("signature-1".to_string()),
                    }),
                }],
            }],
        );

        let wallet_matches = registry
            .matches_for_destination_wallet("Wallet111")
            .expect("wallet should be indexed");
        assert_eq!(wallet_matches.len(), 1);
        assert_eq!(wallet_matches[0].organization_id, "organization-1");

        let pending_by_wallet = registry
            .pending_requests_for_destination_wallet("organization-1", "Wallet111")
            .expect("pending request should also be indexed by wallet");
        assert_eq!(pending_by_wallet.len(), 1);
        assert_eq!(pending_by_wallet[0].transfer_request_id, "request-1");
        assert_eq!(pending_by_wallet[0].destination_wallet_address, "Wallet111");
        assert_eq!(
            pending_by_wallet[0].submitted_signature.as_deref(),
            Some("signature-1")
        );
        assert_eq!(registry.version(), 42);
        assert!(registry.is_watched_address("SourceWallet111"));
        assert!(registry.is_watched_address("SourceAta111"));
        assert!(!registry.is_watched_address("Wallet111"));
        assert!(!registry.is_watched_address("Ata111"));
        assert!(registry.is_submitted_signature("signature-1"));
    }
}
