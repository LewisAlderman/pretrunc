# pretrunc against the prior art: chromium

Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/156.0.8078.4 Safari/537.36

### 5,000 names, end of one line, 120 px

|                                        | cold ms | warm ms | overflows |
| -------------------------------------- | ------: | ------: | --------: |
| pretrunc `cut`                         |    28.8 |     1.2 |         0 |
| pretext demo `clampLines`              |    22.4 |     1.0 |         0 |
| pretext-truncate `findTruncationPoint` |    18.5 |     n/a |        16 |

### 5,000 paths, middle of one line keeping the file name, 160 px

|                             | cold ms | warm ms | overflows |
| --------------------------- | ------: | ------: | --------: |
| pretrunc `cut`, middle      |    35.4 |     2.8 |         0 |
| pretext demo `layoutMiddle` |    65.7 |     4.7 |         1 |

### 500 paragraphs, end of 3 lines, 260 px

|                                        | cold ms | warm ms | overflows |
| -------------------------------------- | ------: | ------: | --------: |
| pretrunc `clamp`                       |    17.2 |     0.4 |         0 |
| pretext demo `clampLines`              |     5.9 |     0.4 |         0 |
| pretext-truncate `findTruncationPoint` |     8.6 |     n/a |        18 |
