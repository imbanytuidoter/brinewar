use crate::fleet::CELLS;
use near_sdk::env;

pub const DEPTH: usize = 7;
pub const LEAVES: usize = 1 << DEPTH;

pub type Hash = [u8; 32];

pub fn leaf_hash(index: u8, cell: u8, salt: &Hash) -> Hash {
    let mut buf = [0u8; 34];
    buf[0] = index;
    buf[1] = cell;
    buf[2..].copy_from_slice(salt);
    env::sha256_array(buf)
}

pub fn node_hash(left: &Hash, right: &Hash) -> Hash {
    let mut buf = [0u8; 64];
    buf[..32].copy_from_slice(left);
    buf[32..].copy_from_slice(right);
    env::sha256_array(buf)
}

pub fn board_root(cells: &[u8; CELLS], salts: &[Hash; CELLS]) -> Hash {
    let mut level: Vec<Hash> = (0..LEAVES)
        .map(|i| {
            if i < CELLS {
                leaf_hash(i as u8, cells[i], &salts[i])
            } else {
                [0u8; 32]
            }
        })
        .collect();
    while level.len() > 1 {
        level = level
            .chunks_exact(2)
            .map(|pair| node_hash(&pair[0], &pair[1]))
            .collect();
    }
    level[0]
}

pub fn root_from_proof(index: u8, cell: u8, salt: &Hash, proof: &[Hash; DEPTH]) -> Hash {
    let mut acc = leaf_hash(index, cell, salt);
    let mut pos = index as usize;
    for sibling in proof {
        acc = if pos & 1 == 0 {
            node_hash(&acc, sibling)
        } else {
            node_hash(sibling, &acc)
        };
        pos >>= 1;
    }
    acc
}

#[cfg(test)]
pub mod testing {
    use super::*;

    pub fn salts(seed: u8) -> [Hash; CELLS] {
        let mut out = [[0u8; 32]; CELLS];
        for (i, s) in out.iter_mut().enumerate() {
            *s = env::sha256_array([seed, i as u8]);
        }
        out
    }

    pub fn proof(cells: &[u8; CELLS], salts: &[Hash; CELLS], index: u8) -> [Hash; DEPTH] {
        let mut level: Vec<Hash> = (0..LEAVES)
            .map(|i| {
                if i < CELLS {
                    leaf_hash(i as u8, cells[i], &salts[i])
                } else {
                    [0u8; 32]
                }
            })
            .collect();
        let mut pos = index as usize;
        let mut out = [[0u8; 32]; DEPTH];
        for slot in out.iter_mut() {
            *slot = level[pos ^ 1];
            level = level
                .chunks_exact(2)
                .map(|pair| node_hash(&pair[0], &pair[1]))
                .collect();
            pos >>= 1;
        }
        out
    }
}

#[cfg(test)]
mod tests {
    use super::testing::*;
    use super::*;
    use sha2::{Digest, Sha256};

    fn cells() -> [u8; CELLS] {
        let mut c = [0u8; CELLS];
        for i in [
            0, 1, 2, 3, 20, 21, 22, 26, 27, 28, 40, 41, 44, 45, 48, 49, 60, 62, 64, 66,
        ] {
            c[i] = 1;
        }
        c
    }

    #[test]
    fn root_matches_the_cross_language_vector() {
        let root = board_root(&cells(), &salts(1));
        assert_eq!(
            hex::encode(root),
            "8ab7b3f47076706dafea77fdc8f17be3a0d5c88ea848b3c3849b9c1d3ff7df48"
        );
    }

    #[test]
    fn leaf_matches_reference_sha256() {
        let salt = [7u8; 32];
        let mut h = Sha256::new();
        h.update([42u8, 1u8]);
        h.update(salt);
        let expected: [u8; 32] = h.finalize().into();
        assert_eq!(leaf_hash(42, 1, &salt), expected);
    }

    #[test]
    fn padding_leaves_are_zero_bytes() {
        let c = cells();
        let s = salts(1);
        let p = proof(&c, &s, 99);
        assert_eq!(p[0], leaf_hash(98, c[98], &s[98]));
        let z1 = node_hash(&[0u8; 32], &[0u8; 32]);
        assert_eq!(p[2], node_hash(&z1, &z1));
    }

    #[test]
    fn valid_proof_rebuilds_root_for_every_cell() {
        let c = cells();
        let s = salts(1);
        let root = board_root(&c, &s);
        for i in 0..CELLS as u8 {
            let p = proof(&c, &s, i);
            assert_eq!(root_from_proof(i, c[i as usize], &s[i as usize], &p), root);
        }
    }

    #[test]
    fn flipped_cell_breaks_proof() {
        let c = cells();
        let s = salts(1);
        let root = board_root(&c, &s);
        let p = proof(&c, &s, 0);
        assert_ne!(root_from_proof(0, 0, &s[0], &p), root);
    }

    #[test]
    fn wrong_salt_breaks_proof() {
        let c = cells();
        let s = salts(1);
        let root = board_root(&c, &s);
        let p = proof(&c, &s, 5);
        assert_ne!(root_from_proof(5, c[5], &s[6], &p), root);
    }

    #[test]
    fn proof_for_other_index_fails() {
        let c = cells();
        let s = salts(1);
        let root = board_root(&c, &s);
        let p = proof(&c, &s, 5);
        assert_ne!(root_from_proof(4, c[5], &s[5], &p), root);
    }
}
