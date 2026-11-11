pub const BOARD_SIZE: usize = 10;
pub const CELLS: usize = BOARD_SIZE * BOARD_SIZE;
pub const FLEET: [(usize, usize); 4] = [(4, 1), (3, 2), (2, 3), (1, 4)];
pub const SHIP_CELLS: usize = 20;

#[derive(Debug, PartialEq, Eq)]
pub enum FleetError {
    BadCell,
    WrongCellCount,
    NotStraight,
    TooLong,
    WrongShipCount,
}

impl FleetError {
    pub fn as_str(&self) -> &'static str {
        match self {
            FleetError::BadCell => "cell values must be 0 or 1",
            FleetError::WrongCellCount => "fleet must occupy exactly 20 cells",
            FleetError::NotStraight => "ships must be straight and must not touch",
            FleetError::TooLong => "ship longer than 4 cells",
            FleetError::WrongShipCount => "fleet must be 1x4, 2x3, 3x2, 4x1",
        }
    }
}

pub fn validate_fleet(cells: &[u8; CELLS]) -> Result<(), FleetError> {
    if cells.iter().any(|&c| c > 1) {
        return Err(FleetError::BadCell);
    }
    if cells.iter().filter(|&&c| c == 1).count() != SHIP_CELLS {
        return Err(FleetError::WrongCellCount);
    }
    let mut seen = [false; CELLS];
    let mut counts = [0usize; 5];
    for start in 0..CELLS {
        if cells[start] == 0 || seen[start] {
            continue;
        }
        let ship = collect_component(cells, start, &mut seen);
        let len = straight_length(&ship).ok_or(FleetError::NotStraight)?;
        if len > 4 {
            return Err(FleetError::TooLong);
        }
        counts[len] += 1;
    }
    if FLEET.iter().all(|&(len, n)| counts[len] == n) {
        Ok(())
    } else {
        Err(FleetError::WrongShipCount)
    }
}

fn collect_component(cells: &[u8; CELLS], start: usize, seen: &mut [bool; CELLS]) -> Vec<usize> {
    let mut stack = vec![start];
    let mut out = Vec::new();
    seen[start] = true;
    while let Some(i) = stack.pop() {
        out.push(i);
        for n in neighbours8(i) {
            if cells[n] == 1 && !seen[n] {
                seen[n] = true;
                stack.push(n);
            }
        }
    }
    out
}

fn neighbours8(i: usize) -> impl Iterator<Item = usize> {
    let (x, y) = ((i % BOARD_SIZE) as i32, (i / BOARD_SIZE) as i32);
    (-1..=1)
        .flat_map(move |dy| (-1..=1).map(move |dx| (x + dx, y + dy)))
        .filter(move |&(nx, ny)| {
            (nx, ny) != (x, y)
                && (0..BOARD_SIZE as i32).contains(&nx)
                && (0..BOARD_SIZE as i32).contains(&ny)
        })
        .map(|(nx, ny)| ny as usize * BOARD_SIZE + nx as usize)
}

fn straight_length(ship: &[usize]) -> Option<usize> {
    let xs: Vec<usize> = ship.iter().map(|i| i % BOARD_SIZE).collect();
    let ys: Vec<usize> = ship.iter().map(|i| i / BOARD_SIZE).collect();
    let same_row = ys.iter().all(|&y| y == ys[0]);
    let same_col = xs.iter().all(|&x| x == xs[0]);
    let span = if same_row {
        xs.iter().max()? - xs.iter().min()? + 1
    } else if same_col {
        ys.iter().max()? - ys.iter().min()? + 1
    } else {
        return None;
    };
    (span == ship.len()).then_some(span)
}

#[cfg(test)]
mod tests {
    use super::*;

    pub fn board(ships: &[&[usize]]) -> [u8; CELLS] {
        let mut b = [0u8; CELLS];
        for ship in ships {
            for &i in *ship {
                b[i] = 1;
            }
        }
        b
    }

    pub fn legal() -> [u8; CELLS] {
        board(&[
            &[0, 1, 2, 3],
            &[20, 21, 22],
            &[26, 27, 28],
            &[40, 41],
            &[44, 45],
            &[48, 49],
            &[60],
            &[62],
            &[64],
            &[66],
        ])
    }

    #[test]
    fn legal_fleet_passes() {
        assert_eq!(validate_fleet(&legal()), Ok(()));
    }

    #[test]
    fn vertical_ships_pass() {
        let b = board(&[
            &[0, 10, 20, 30],
            &[2, 12, 22],
            &[4, 14, 24],
            &[6, 16],
            &[8, 18],
            &[52, 62],
            &[90],
            &[92],
            &[94],
            &[99],
        ]);
        assert_eq!(validate_fleet(&b), Ok(()));
    }

    #[test]
    fn bad_cell_value_fails() {
        let mut b = legal();
        b[99] = 2;
        assert_eq!(validate_fleet(&b), Err(FleetError::BadCell));
    }

    #[test]
    fn wrong_cell_count_fails() {
        let mut b = legal();
        b[66] = 0;
        assert_eq!(validate_fleet(&b), Err(FleetError::WrongCellCount));
        let mut b = legal();
        b[99] = 1;
        assert_eq!(validate_fleet(&b), Err(FleetError::WrongCellCount));
    }

    #[test]
    fn corner_touch_fails() {
        let mut b = legal();
        b[66] = 0;
        b[73] = 1;
        assert_eq!(validate_fleet(&b), Err(FleetError::NotStraight));
    }

    #[test]
    fn side_touch_merges_and_fails() {
        let mut b = legal();
        b[66] = 0;
        b[61] = 1;
        assert!(validate_fleet(&b).is_err());
    }

    #[test]
    fn bent_ship_fails() {
        let mut b = legal();
        b[28] = 0;
        b[37] = 1;
        assert_eq!(validate_fleet(&b), Err(FleetError::NotStraight));
    }

    #[test]
    fn five_long_ship_fails() {
        let b = board(&[
            &[0, 1, 2, 3, 4],
            &[20, 21, 22],
            &[26, 27, 28],
            &[40, 41],
            &[44, 45],
            &[60],
            &[62],
            &[64],
            &[66],
            &[68],
        ]);
        assert_eq!(validate_fleet(&b), Err(FleetError::TooLong));
    }

    #[test]
    fn wrong_mix_fails() {
        let b = board(&[
            &[0, 1, 2, 3],
            &[20, 21, 22, 23],
            &[40, 41, 42],
            &[46, 47],
            &[60, 61],
            &[64, 65],
            &[80],
            &[82],
            &[84],
        ]);
        assert_eq!(validate_fleet(&b), Err(FleetError::WrongShipCount));
    }

    #[test]
    fn row_wrap_does_not_join_ships() {
        let b = board(&[
            &[7, 8, 9],
            &[10],
            &[30, 31, 32, 33],
            &[35, 36, 37],
            &[50, 51],
            &[54, 55],
            &[58, 59],
            &[70],
            &[72],
            &[74],
        ]);
        assert_eq!(validate_fleet(&b), Ok(()));
    }
}
