# Model comparison — delay regression

Split sizes: {'train': 59, 'validation': 20, 'test': 21}  (chronological, dates never shared)

## 1. Cross-validated selection (development window only)

| model                     | encoder   |   cv_mae_minutes |   cv_mae_std | best_params                                                                            |
|:--------------------------|:----------|-----------------:|-------------:|:---------------------------------------------------------------------------------------|
| hist_gradient_boosting    | target    |           22.606 |        5.406 | {'learning_rate': 0.05, 'max_depth': 2, 'max_iter': 150, 'min_samples_leaf': 10}       |
| lightgbm                  | target    |           22.785 |        5.209 | {'learning_rate': 0.03, 'min_child_samples': 10, 'n_estimators': 150, 'num_leaves': 7} |
| baseline_global_median    | none      |           23.979 |        7.921 | {}                                                                                     |
| random_forest             | target    |           24.128 |        6.822 | {'max_depth': None, 'min_samples_leaf': 3, 'n_estimators': 200}                        |
| baseline_global_mean      | none      |           24.677 |        5.483 | {}                                                                                     |
| lightgbm                  | onehot    |           25.487 |        4.274 | {'learning_rate': 0.03, 'min_child_samples': 10, 'n_estimators': 150, 'num_leaves': 7} |
| hist_gradient_boosting    | onehot    |           25.543 |        3.872 | {'learning_rate': 0.05, 'max_depth': 3, 'max_iter': 150, 'min_samples_leaf': 10}       |
| xgboost                   | target    |           26.476 |        7.061 | {'learning_rate': 0.03, 'max_depth': 2, 'n_estimators': 150, 'subsample': 0.8}         |
| random_forest             | onehot    |           27.621 |        5.795 | {'max_depth': 3, 'min_samples_leaf': 3, 'n_estimators': 400}                           |
| baseline_per_train_mean   | none      |           27.662 |        8.308 | {}                                                                                     |
| baseline_per_route_median | none      |           28.03  |        7.309 | {}                                                                                     |
| baseline_per_train_median | none      |           28.03  |        7.309 | {}                                                                                     |
| ridge                     | target    |           28.224 |       10.241 | {'alpha': 30.0}                                                                        |
| ridge                     | onehot    |           30.365 |       12.724 | {'alpha': 30.0}                                                                        |
| xgboost                   | onehot    |           31.289 |        6.946 | {'learning_rate': 0.03, 'max_depth': 2, 'n_estimators': 150, 'subsample': 0.8}         |

Selected by CV: **hist_gradient_boosting + target encoder** (CV MAE 22.61 ± 5.41 min)

## 2. Held-out test set (scored once)

| model                                  |   mae_minutes |   rmse_minutes |   median_ae_minutes |     r2 |
|:---------------------------------------|--------------:|---------------:|--------------------:|-------:|
| SELECTED hist_gradient_boosting+target |        29.918 |         41.705 |              24.925 | -0.079 |
| baseline_global_mean                   |        25.459 |         41.128 |              15.367 | -0.049 |
| baseline_global_median                 |        27.524 |         45.56  |              17     | -0.287 |
| baseline_per_train_mean                |        25.917 |         41.109 |              15     | -0.048 |
| baseline_per_train_median              |        29.524 |         46.95  |              19     | -0.367 |
| baseline_per_route_median              |        29.524 |         46.95  |              19     | -0.367 |

On the held-out test set **the selected model does NOT beat the best baseline**: 29.92 min MAE versus 25.46 min for `baseline_global_mean` (difference +4.46 min). Every r2 is negative, i.e. no model explains variance better than the test mean.

## 3. Prediction intervals

| method           |   nominal |   coverage |   mean_width_minutes |
|:-----------------|----------:|-----------:|---------------------:|
| quantile P10-P90 |       0.8 |      0.762 |               53.273 |
| split conformal  |       0.8 |      0.905 |               91.129 |

Test pinball loss: {'q0.1': 4.115, 'q0.5': 14.358, 'q0.9': 10.922}

P50 quantile model as a point estimate: {'mae_minutes': 28.715, 'rmse_minutes': 42.991, 'median_ae_minutes': 21.686, 'r2': -0.146}

## 4. Classifiers

- Binary P(delay > 15 min): {'f1': 0.895, 'accuracy': 0.81, 'brier': 0.193, 'positive_rate': 0.81, 'pr_auc': 0.98, 'roc_auc': 0.897}
- Four-class band: {'f1_macro': 0.2, 'f1_weighted': 0.533, 'accuracy': 0.667, 'log_loss': 1.098}

## 5. Error by segment (selected model, test)

### By train_number

|   train_number |   count |   mae_minutes |   bias_minutes |   actual_mean |
|---------------:|--------:|--------------:|---------------:|--------------:|
|          22832 |       2 |         85.65 |         -85.65 |        124    |
|          12002 |       2 |         35.57 |          35.57 |         14.5  |
|          12377 |       2 |         29.15 |         -28.24 |         62.5  |
|          12633 |       2 |         27.85 |           7.04 |         19.5  |
|          12604 |       2 |         25.85 |          16.4  |         22.5  |
|          12238 |       2 |         25.85 |          16.22 |         32.5  |
|          12301 |       2 |         22.33 |         -22.33 |         42.5  |
|          15029 |       3 |         21.26 |         -20.43 |         56.67 |
|          12229 |       2 |         17.66 |          -7.26 |         27    |
|          15906 |       2 |         12.35 |           7.93 |         27    |

### By run_frequency

| run_frequency   |   count |   mae_minutes |   bias_minutes |   actual_mean |
|:----------------|--------:|--------------:|---------------:|--------------:|
| DAILY           |      14 |         34.39 |          -5.72 |         40.36 |
| TRI_WEEKLY      |       2 |         29.15 |         -28.24 |         62.5  |
| WEEKLY          |       5 |         17.69 |          -9.09 |         44.8  |
