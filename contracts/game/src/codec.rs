use crate::fleet::CELLS;
use crate::merkle::{Hash, DEPTH};

pub fn parse_hash(hex_str: &str, what: &str) -> Result<Hash, String> {
    let raw = hex_str.strip_prefix("0x").unwrap_or(hex_str);
    let bytes = hex::decode(raw).map_err(|_| format!("{what} must be hex"))?;
    bytes
        .try_into()
        .map_err(|_| format!("{what} must be 32 bytes"))
}

pub fn parse_proof(proof: &[String]) -> Result<[Hash; DEPTH], String> {
    if proof.len() != DEPTH {
        return Err(format!("proof must have {DEPTH} hashes"));
    }
    let mut out = [[0u8; 32]; DEPTH];
    for (slot, h) in out.iter_mut().zip(proof) {
        *slot = parse_hash(h, "proof hash")?;
    }
    Ok(out)
}

pub fn parse_cells(cells: &str) -> Result<[u8; CELLS], String> {
    let bytes = cells.as_bytes();
    if bytes.len() != CELLS {
        return Err(format!("cells must be {CELLS} characters"));
    }
    let mut out = [0u8; CELLS];
    for (slot, &b) in out.iter_mut().zip(bytes) {
        *slot = match b {
            b'0' => 0,
            b'1' => 1,
            _ => return Err("cells must be 0 or 1".into()),
        };
    }
    Ok(out)
}

pub fn parse_salts(salts: &[String]) -> Result<[Hash; CELLS], String> {
    if salts.len() != CELLS {
        return Err(format!("salts must have {CELLS} entries"));
    }
    let mut out = [[0u8; 32]; CELLS];
    for (slot, s) in out.iter_mut().zip(salts) {
        *slot = parse_hash(s, "salt")?;
    }
    Ok(out)
}

pub fn cells_to_string(cells: &[u8; CELLS]) -> String {
    cells
        .iter()
        .map(|&c| if c == 1 { '1' } else { '0' })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_hash_with_and_without_prefix() {
        let h = "ab".repeat(32);
        assert_eq!(parse_hash(&h, "root").unwrap(), [0xab; 32]);
        assert_eq!(parse_hash(&format!("0x{h}"), "root").unwrap(), [0xab; 32]);
    }

    #[test]
    fn rejects_short_or_non_hex_hash() {
        assert!(parse_hash("abcd", "root").is_err());
        assert!(parse_hash(&"zz".repeat(32), "root").is_err());
    }

    #[test]
    fn rejects_proof_of_wrong_length() {
        let p = vec!["00".repeat(32); 6];
        assert!(parse_proof(&p).is_err());
    }

    #[test]
    fn cells_round_trip_and_reject_other_chars() {
        let s = "01".repeat(50);
        assert_eq!(cells_to_string(&parse_cells(&s).unwrap()), s);
        assert!(parse_cells(&"2".repeat(100)).is_err());
        assert!(parse_cells("01").is_err());
    }
}
