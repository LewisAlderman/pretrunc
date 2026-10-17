# pretrunc against the prior art: chromium

Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/156.0.8078.4 Safari/537.36

### 5,000 names, end of one line, 120 px

|                                        | cold ms | warm ms | overflows |
| -------------------------------------- | ------: | ------: | --------: |
| pretrunc `cut`                         |    15.7 |     0.8 |         0 |
| pretext demo `clampLines`              |    14.7 |     0.8 |         0 |
| pretext-truncate `findTruncationPoint` |    17.6 |     n/a |        16 |

### 5,000 paths, middle of one line keeping the file name, 160 px

|                             | cold ms | warm ms | overflows |
| --------------------------- | ------: | ------: | --------: |
| pretrunc `cut`, middle      |    21.7 |     1.8 |         0 |
| pretext demo `layoutMiddle` |    63.5 |     4.0 |         1 |

### 500 paragraphs, end of 3 lines, 260 px

|                                        | cold ms | warm ms | overflows |
| -------------------------------------- | ------: | ------: | --------: |
| pretrunc `clamp`                       |     8.6 |     0.5 |         0 |
| pretext demo `clampLines`              |     6.0 |     0.4 |         0 |
| pretext-truncate `findTruncationPoint` |     8.0 |     n/a |        18 |
