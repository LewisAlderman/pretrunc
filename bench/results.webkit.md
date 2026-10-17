# pretrunc against the prior art: webkit

Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/27.2 Safari/605.1.15

### 5,000 names, end of one line, 120 px

|                                        | cold ms | warm ms | overflows |
| -------------------------------------- | ------: | ------: | --------: |
| pretrunc `cut`                         |    22.0 |     1.0 |         0 |
| pretext demo `clampLines`              |    14.0 |     1.0 |         0 |
| pretext-truncate `findTruncationPoint` |    14.0 |     n/a |        16 |

### 5,000 paths, middle of one line keeping the file name, 160 px

|                             | cold ms | warm ms | overflows |
| --------------------------- | ------: | ------: | --------: |
| pretrunc `cut`, middle      |   116.0 |     2.0 |         0 |
| pretext demo `layoutMiddle` |   256.0 |     7.0 |        10 |

### 500 paragraphs, end of 3 lines, 260 px

|                                        | cold ms | warm ms | overflows |
| -------------------------------------- | ------: | ------: | --------: |
| pretrunc `clamp`                       |    15.0 |     1.0 |         0 |
| pretext demo `clampLines`              |     6.0 |     0.0 |         0 |
| pretext-truncate `findTruncationPoint` |    10.0 |     n/a |        18 |
