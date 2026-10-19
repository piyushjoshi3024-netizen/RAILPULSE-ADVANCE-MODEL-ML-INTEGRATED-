# EDA — RailPulse Indian Railways delay dataset

- Source file: `data/indian_railway_delay_data_.csv` (cleaned to `journeys_clean.parquet`)
- Rows: **552** · Columns: **19**
- Journey dates: **2023-01-04 → 2026-09-29**
- Distinct journey dates: **458**, all in month(s) **[np.int32(1), np.int32(2), np.int32(3), np.int32(4), np.int32(5), np.int32(6), np.int32(7), np.int32(8), np.int32(9), np.int32(10), np.int32(11), np.int32(12)]**
- Distinct trains: **12** · routes: **12**

## Schema

| column                    | dtype          |   missing |   distinct | example             |
|:--------------------------|:---------------|----------:|-----------:|:--------------------|
| trip_id                   | str            |         0 |        552 | 12377|2023-01-04    |
| record_id                 | str            |         0 |        552 | RP0185              |
| train_number              | str            |         0 |         12 | 12377               |
| train_name                | str            |         0 |         12 | Garib Rath Express  |
| source                    | str            |         0 |         12 | Kolkata             |
| destination               | str            |         0 |          7 | New Delhi           |
| journey_date              | datetime64[us] |         0 |        458 | 2023-01-04 00:00:00 |
| scheduled_arrival_at      | datetime64[us] |         0 |        546 | 2023-01-04 08:00:00 |
| scheduled_arrival_minutes | float64        |         0 |         10 | 480.0               |
| actual_arrival_minutes    | float64        |         0 |        341 | 570.0               |
| distance_km               | int64          |         0 |         12 | 1318                |
| season                    | str            |         0 |          4 | WINTER              |
| run_frequency             | str            |         0 |          3 | TRI_WEEKLY          |
| delay_minutes             | float64        |         0 |        113 | 90.0                |
| delay_minutes_stated      | float64        |         0 |        113 | 90.0                |
| delay_minutes_computed    | float64        |         0 |        113 | 90.0                |
| delay_reconciled          | bool           |         0 |          2 | True                |
| delay_band                | str            |         0 |          5 | MAJOR               |
| is_significant_delay      | int64          |         0 |          2 | 1                   |

## Target: delay_minutes

|           |   value |
|:----------|--------:|
| count     | 552     |
| mean      |  35.136 |
| std       |  36.082 |
| min       |   0     |
| p10       |   4     |
| p25       |  11     |
| median    |  25     |
| p75       |  47     |
| p90       |  79     |
| max       | 240     |
| skew      |   2.222 |
| zeros     |  20     |
| negatives |   0     |
| pct_gt_15 |   0.654 |

![delay distribution](figures/delay_distribution.png)

The target is right-skewed (skew 2.22). There are **no negative delays**, i.e. the dataset records no early arrivals, which is unusual for real punctuality data and limits what the model can learn.

## Delay by segment

### By train

|   train_number |   count |   mean |   std |   median |
|---------------:|--------:|-------:|------:|---------:|
|          12625 |      46 |  56.46 | 39.27 |     43   |
|          15029 |      46 |  52.17 | 50.59 |     34   |
|          15906 |      46 |  51.22 | 37.88 |     48   |
|          22832 |      46 |  42.2  | 32.16 |     39.5 |
|          12238 |      46 |  38.76 | 44.66 |     25.5 |
|          12621 |      46 |  35.3  | 28.25 |     28   |
|          12301 |      46 |  32.43 | 37.07 |     25   |
|          12604 |      46 |  31.67 | 35.79 |     23   |
|          12377 |      46 |  31.13 | 23.9  |     25   |
|          12633 |      46 |  19.8  | 24.86 |     16   |
|          12229 |      46 |  19.76 | 18.37 |     13.5 |
|          12002 |      46 |  10.72 | 13.33 |      6   |

### By run frequency

| run_frequency   |   count |   mean |   std |   median |
|:----------------|--------:|-------:|------:|---------:|
| WEEKLY          |      92 |  51.7  | 44.44 |       40 |
| DAILY           |     414 |  31.9  | 34.15 |       22 |
| TRI_WEEKLY      |      46 |  31.13 | 23.9  |       25 |

### By destination

| destination    |   count |   mean |   std |   median |
|:---------------|--------:|-------:|------:|---------:|
| Pune           |      46 |  52.17 | 50.59 |     34   |
| Howrah         |      46 |  42.2  | 32.16 |     39.5 |
| Jammu          |      46 |  38.76 | 44.66 |     25.5 |
| Kanyakumari    |      92 |  35.51 | 35.56 |     25   |
| New Delhi      |     230 |  35.02 | 32.44 |     25.5 |
| Chennai        |      46 |  31.67 | 35.79 |     23   |
| RANI KAMLAPATI |      46 |  10.72 | 13.33 |      6   |

![delay by segment](figures/delay_by_segment.png)

![delay vs distance](figures/delay_vs_distance.png)

## Cardinality and zero-variance columns

| column                    |   distinct |
|:--------------------------|-----------:|
| is_significant_delay      |          2 |
| delay_reconciled          |          2 |
| run_frequency             |          3 |
| season                    |          4 |
| delay_band                |          5 |
| destination               |          7 |
| scheduled_arrival_minutes |         10 |
| distance_km               |         12 |
| source                    |         12 |
| train_name                |         12 |
| train_number              |         12 |
| delay_minutes_stated      |        113 |
| delay_minutes_computed    |        113 |
| delay_minutes             |        113 |
| actual_arrival_minutes    |        341 |
| journey_date              |        458 |
| scheduled_arrival_at      |        546 |
| record_id                 |        552 |
| trip_id                   |        552 |

## Leakage audit

| check                                          | detail                                                                                                                                                                                  | result   |
|:-----------------------------------------------|:----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|:---------|
| post-outcome columns excluded from features    | ['actual_arrival_minutes', 'delay_minutes_computed', 'delay_minutes_stated'] are retained for audit only and must never enter the feature set                                           | PASS     |
| target-derived columns identified              | ['delay_minutes', 'delay_minutes_stated', 'delay_minutes_computed', 'delay_reconciled', 'delay_band', 'is_significant_delay'] all derive from the target and are excluded from features | PASS     |
| trip_id is unique (no same trip in two splits) | 0 duplicated trip_id values                                                                                                                                                             | PASS     |
| trip grouping is informative                   | 552 groups for 552 rows (ratio 1.00); a ratio of 1.00 means group-aware splitting is a no-op on this dataset                                                                            | FAIL     |
| no zero-variance feature columns               | constant columns: []                                                                                                                                                                    | PASS     |
