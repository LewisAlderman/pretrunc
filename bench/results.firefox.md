# pretrunc against the prior art: firefox

Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:157.0) Gecko/20100101 Firefox/157.0

### 5,000 names, end of one line, 120 px

|                                        | cold ms | warm ms | overflows |
| -------------------------------------- | ------: | ------: | --------: |
| pretrunc `cut`                         |    27.0 |     2.0 |         0 |
| pretext demo `clampLines`              |    30.0 |     1.0 |         0 |
| pretext-truncate `findTruncationPoint` |    44.0 |     n/a |        16 |

### 5,000 paths, middle of one line keeping the file name, 160 px

|                             | cold ms | warm ms | overflows |
| --------------------------- | ------: | ------: | --------: |
| pretrunc `cut`, middle      |    79.0 |     3.0 |         0 |
| pretext demo `layoutMiddle` |   105.0 |     9.0 |        11 |

### 500 paragraphs, end of 3 lines, 260 px

|                                        | cold ms | warm ms | overflows |
| -------------------------------------- | ------: | ------: | --------: |
| pretrunc `clamp`                       |    25.0 |     2.0 |         0 |
| pretext demo `clampLines`              |    13.0 |     0.0 |         0 |
| pretext-truncate `findTruncationPoint` |    20.0 |     n/a |        19 |
