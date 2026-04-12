use spl_token::solana_program::program_option::COption;
use spl_token::state::AccountState as SplTokenAccountState;

pub(crate) fn format_amount(amount_raw: i128) -> String {
    let negative = amount_raw < 0;
    let amount = amount_raw.abs();
    let whole = amount / 1_000_000;
    let frac = amount % 1_000_000;

    if negative {
        format!("-{}.{:06}", whole, frac)
    } else {
        format!("{}.{:06}", whole, frac)
    }
}

pub(crate) fn parse_amount_raw(value: &str) -> i128 {
    value.parse::<i128>().unwrap_or_default()
}

pub(crate) fn coption_pubkey_to_string(
    value: &COption<spl_token::solana_program::pubkey::Pubkey>,
) -> String {
    match value {
        COption::Some(pubkey) => pubkey.to_string(),
        COption::None => "none".to_string(),
    }
}

pub(crate) fn token_account_state_label(state: SplTokenAccountState) -> &'static str {
    match state {
        SplTokenAccountState::Uninitialized => "uninitialized",
        SplTokenAccountState::Initialized => "initialized",
        SplTokenAccountState::Frozen => "frozen",
    }
}

#[cfg(test)]
mod tests {
    use super::format_amount;

    #[test]
    fn format_amount_renders_usdc_decimals() {
        assert_eq!(format_amount(1), "0.000001");
        assert_eq!(format_amount(12_345_678), "12.345678");
        assert_eq!(format_amount(-12_345_678), "-12.345678");
    }
}
