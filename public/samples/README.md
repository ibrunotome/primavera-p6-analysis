# Public Primavera P6 samples

The two public originals below are unmodified XER examples from
[JaiLaff/XER-Splitter](https://github.com/JaiLaff/XER-Splitter), pinned to commit
`58a1000ed503576de967c578f10ac09807444c05`.

| File                         |      Bytes | Activities | Encoding     |
| ---------------------------- | ---------: | ---------: | ------------ |
| [airport.xer](./airport.xer) |     71,429 |         66 | Windows-1252 |
| [rehab-2.xer](./rehab-2.xer) | 18,592,333 |      6,977 | Windows-1256 |

## Sources

- [airport.xer original download](https://raw.githubusercontent.com/JaiLaff/XER-Splitter/58a1000ed503576de967c578f10ac09807444c05/tests/Example-XERs/airport.xer)
- [rehab-2.xer original download](https://raw.githubusercontent.com/JaiLaff/XER-Splitter/58a1000ed503576de967c578f10ac09807444c05/tests/Example-XERs/rehab-2.xer)
- [Source repository license](https://github.com/JaiLaff/XER-Splitter/blob/58a1000ed503576de967c578f10ac09807444c05/LICENSE)

## Deliberately modified demo

[airport-errors.xer](./airport-errors.xer) is a synthetic test fixture derived
from airport.xer. It is not a third public original. Its project code is
TERMINAL-2-DEMO-ERRORS so the distinction is also visible after import.
The original files remain unchanged.

The fixture keeps Windows-1252 encoding and applies only these changes:

| Change                                                                          | Location                                  | Expected behavior                                               |
| ------------------------------------------------------------------------------- | ----------------------------------------- | --------------------------------------------------------------- |
| Label the project TERMINAL-2-DEMO-ERRORS                                        | Fixture line 43                           | Identify the deliberately modified example                      |
| Change total float from 8 to not-a-number on BA-P1-30 (task_id 120011)          | Fixture line 101                          | Report invalid-number; keep the activity with unavailable float |
| Change total float from 8 to -8 hours on BA-P1-40 (task_id 120012)              | Fixture line 102                          | Report a negative-float finding                                 |
| Append a duplicate of task_id 120010 with the name DEMO: Duplicate activity row | Fixture line 165                          | Report duplicate-id; retain the original activity at line 100   |
| Append DEMO-BROKEN (task_id 990001), omitting the last field                    | Fixture line 166                          | Report column-count and reject that row                         |
| Remove relationship 152737 from BA-P1-10 to BA-P1-20                            | Original line 230; removed in the fixture | Report BA-P1-20 as missing a predecessor                        |

No scheduling engine recalculated the dates or float after these edits.
This file demonstrates parsing and checker behavior using controlled input.

Expected results at the default high-float threshold of 352 hours:

- Import status: partial.
- 66 usable activities and 83 relationships.
- Three import issues at lines 101, 165, and 166.
- Two rejected activity rows; one retained activity with unavailable float.
- One missing-link finding: BA-P1-20, missing its predecessor.
- One negative-float finding: BA-P1-40 at -8 hours.
- Ten high-float findings, inherited unchanged from the original.
- All three check summaries are partial because some activity records were
  rejected. The individual findings are confirmed for the usable data.

The fixture is available at /samples/airport-errors.xer when the app runs.

## Reading and validation

Both files retain their original encodings. airport.xer uses Windows-1252 and
rehab-2.xer uses Windows-1256 for its Arabic activity names. In the browser,
read their bytes using `arrayBuffer()` and decode with the matching
`TextDecoder` code page.

Readable files can still contain schedule warnings. These originals are not
guaranteed to pass the three schedule checks. Any deliberately modified error
fixtures should be stored separately and labeled with their changes.

## SHA-256 checksums

```text
a2f3b2469e26f19985ac801786c90edfb965a7bc194a6e57704aa845c5f8611f  airport.xer
2c1dce175b9f078111a48dc13fd1777f5fbd4cd7ab6623e647e7437330c60b7f  rehab-2.xer
4111a86be482210052cc46691f14d012e939932e45afd3ec05e3a931d4367167  airport-errors.xer
```
