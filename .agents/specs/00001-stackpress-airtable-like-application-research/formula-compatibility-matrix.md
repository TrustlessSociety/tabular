# Google Sheets Formula Compatibility Matrix

Access date: 2026-07-23

> Scope disposition (2026-07-24): formula compatibility is deferred to a
> separate later spec. This inventory is historical evidence; P-003 must not
> execute under Spec 00001.

This is a versioned research snapshot, not a claim of complete Google Sheets compatibility and not an acceptance of HyperFormula as the target engine.

## Source Snapshot

- The official [Google Sheets function list](https://support.google.com/docs/table/25273?hl=en) rendered 516 function rows representing 515 distinct names; `UNIQUE` appeared in two categories and was counted once.
- HyperFormula [3.3.0](https://github.com/handsontable/hyperformula/blob/3.3.0/package.json) advertises 418 functions. Its rendered [built-in function catalog](https://hyperformula.handsontable.com/docs/guide/built-in-functions.html) exposed 417 rows and 416 distinct IDs because `NORMDIST` appeared twice.
- The set comparison found 378 same-name functions. HyperFormula's own [difference ledger](https://hyperformula.handsontable.com/docs/guide/list-of-differences.html) documents general semantic differences and concrete divergent examples, so same-name presence is not sufficient evidence of exact behavior.
- HyperFormula 3.3.0 is [GPLv3 or commercially licensed](https://github.com/handsontable/hyperformula/blob/3.3.0/LICENSE.txt). It remains a benchmark and possible licensed candidate, not an accepted dependency.

The catalog-count mismatch is itself a drift signal. A later compatibility Proof must preserve the exact source snapshot, target version, extraction method, and fixture results instead of relying on marketing totals.

## Disposition Rules

| Disposition | Meaning in this research snapshot |
| --- | --- |
| Exact-candidate | Same function name exists in HyperFormula and no incompatibility was found in the vendor's published difference ledger; still requires fixture verification before becoming `exact` |
| Mapped | Requires an alias/operator mapping, or HyperFormula publishes a semantic/result difference that requires a compatibility rule |
| Unsupported | No direct or explicitly justified mapping was found in the 3.3.0 benchmark |
| Volatile | Recalculation depends on time or randomness and needs a target scheduling/cache policy |
| External | Calls Google, the web, an AI service, or another spreadsheet; preserve source text and cached value, but do not execute during v1 import |

These are mutually exclusive inventory buckets. Parser failures, reference-rewrite failures, cycles, and runtime errors are per-formula outcomes layered on top of the function disposition.

## Summary

| Disposition | Distinct Google functions | Research implication |
| --- | ---: | --- |
| Exact-candidate | 324 | Candidate corpus for direct evaluation; not yet proved exact |
| Mapped | 68 | 50 same-name functions need semantic rules; 18 names need aliases or operator mappings |
| Unsupported | 110 | Import with source formula and cached value, report as unsupported |
| Volatile | 4 | Preserve and gate recomputation under an explicit policy |
| External | 9 | Never execute implicitly; preserve provenance and cached value |
| Total | 515 | One row per distinct function name in the Google snapshot |

High-risk gaps are concentrated in dynamic arrays and `LAMBDA` helpers, finance, Google-specific/query functions, dynamic references, parser conversions, statistics, byte-oriented text functions, regex, and external imports.

## Explicit Alias And Operator Mappings

| Google name | HyperFormula 3.3.0 target |
| --- | --- |
| `ADD`, `CONCAT`, `DIVIDE`, `EQ`, `GT`, `GTE`, `LT`, `LTE`, `MINUS`, `MULTIPLY`, `NE`, `POW`, `UMINUS`, `UNARY_PERCENT`, `UPLUS` | Corresponding `HF.*` operator function |
| `ERF.PRECISE` | `ERF` |
| `ERFC.PRECISE` | `ERFC` |
| `NORMSDIST` | `NORM.S.DIST` with an explicit cumulative-mode compatibility rule |

The remaining mapped functions keep the same name but appear in HyperFormula's difference ledger or participate in a documented general difference. They require fixtures and must not be upgraded to exact support by name alone.

## Full Inventory By Disposition

### Exact-candidate

- **Array (7):** `ARRAY_CONSTRAIN`, `MMULT`, `SUMPRODUCT`, `SUMX2MY2`, `SUMX2PY2`, `SUMXMY2`, `TRANSPOSE`
- **Database (12):** `DAVERAGE`, `DCOUNT`, `DCOUNTA`, `DGET`, `DMAX`, `DMIN`, `DPRODUCT`, `DSTDEV`, `DSTDEVP`, `DSUM`, `DVAR`, `DVARP`
- **Date (17):** `DATE`, `DAY`, `DAYS360`, `HOUR`, `ISOWEEKNUM`, `MINUTE`, `MONTH`, `NETWORKDAYS`, `NETWORKDAYS.INTL`, `SECOND`, `TIME`, `WEEKDAY`, `WEEKNUM`, `WORKDAY`, `WORKDAY.INTL`, `YEAR`, `YEARFRAC`
- **Engineering (42):** `BIN2DEC`, `BIN2HEX`, `BIN2OCT`, `BITAND`, `BITLSHIFT`, `BITOR`, `BITRSHIFT`, `BITXOR`, `COMPLEX`, `DEC2BIN`, `DEC2HEX`, `DEC2OCT`, `DELTA`, `ERF`, `HEX2BIN`, `HEX2DEC`, `HEX2OCT`, `IMABS`, `IMAGINARY`, `IMARGUMENT`, `IMCONJUGATE`, `IMCOS`, `IMCOSH`, `IMCOT`, `IMCSC`, `IMCSCH`, `IMDIV`, `IMEXP`, `IMLOG10`, `IMLOG2`, `IMPRODUCT`, `IMREAL`, `IMSEC`, `IMSECH`, `IMSIN`, `IMSINH`, `IMSUB`, `IMSUM`, `IMTAN`, `OCT2BIN`, `OCT2DEC`, `OCT2HEX`
- **Filter (1):** `FILTER`
- **Financial (20):** `CUMIPMT`, `CUMPRINC`, `DDB`, `DOLLARDE`, `DOLLARFR`, `EFFECT`, `FV`, `FVSCHEDULE`, `IPMT`, `IRR`, `ISPMT`, `MIRR`, `NOMINAL`, `NPER`, `PDURATION`, `PMT`, `PPMT`, `SLN`, `SYD`, `TBILLYIELD`
- **Google (1):** `ARRAYFORMULA`
- **Info (12):** `ISBLANK`, `ISERR`, `ISERROR`, `ISFORMULA`, `ISLOGICAL`, `ISNA`, `ISNONTEXT`, `ISNUMBER`, `ISTEXT`, `N`, `NA`, `SHEETS`
- **Logical (10):** `AND`, `FALSE`, `IFERROR`, `IFNA`, `IFS`, `NOT`, `OR`, `SWITCH`, `TRUE`, `XOR`
- **Lookup (11):** `CHOOSE`, `COLUMN`, `FORMULATEXT`, `HLOOKUP`, `INDEX`, `MATCH`, `ROW`, `ROWS`, `SHEET`, `VLOOKUP`, `XLOOKUP`
- **Math (75):** `ABS`, `ACOS`, `ACOSH`, `ACOT`, `ACOTH`, `ASIN`, `ASINH`, `ATAN`, `ATAN2`, `ATANH`, `BASE`, `CEILING`, `CEILING.MATH`, `CEILING.PRECISE`, `COMBINA`, `COS`, `COSH`, `COT`, `COTH`, `COUNTBLANK`, `COUNTIF`, `COUNTIFS`, `COUNTUNIQUE`, `CSC`, `CSCH`, `DECIMAL`, `DEGREES`, `ERFC`, `EVEN`, `EXP`, `FACT`, `FACTDOUBLE`, `FLOOR`, `FLOOR.MATH`, `FLOOR.PRECISE`, `GAMMALN`, `GAMMALN.PRECISE`, `IMLN`, `IMPOWER`, `IMSQRT`, `INT`, `ISEVEN`, `ISO.CEILING`, `ISODD`, `LN`, `LOG`, `LOG10`, `MOD`, `MROUND`, `MULTINOMIAL`, `ODD`, `PI`, `POWER`, `PRODUCT`, `QUOTIENT`, `RADIANS`, `ROUND`, `ROUNDDOWN`, `ROUNDUP`, `SEC`, `SECH`, `SERIESSUM`, `SIGN`, `SIN`, `SINH`, `SQRT`, `SQRTPI`, `SUBTOTAL`, `SUM`, `SUMIF`, `SUMIFS`, `SUMSQ`, `TAN`, `TANH`, `TRUNC`
- **Statistical (90):** `AVERAGE`, `AVERAGEA`, `AVERAGEIF`, `BETADIST`, `BETAINV`, `BINOMDIST`, `CHIDIST`, `CHIINV`, `CHISQ.DIST`, `CHISQ.DIST.RT`, `CHISQ.INV`, `CHISQ.INV.RT`, `CHITEST`, `CONFIDENCE`, `CONFIDENCE.NORM`, `CONFIDENCE.T`, `CORREL`, `COUNT`, `COVAR`, `COVARIANCE.P`, `COVARIANCE.S`, `CRITBINOM`, `EXPON.DIST`, `EXPONDIST`, `F.DIST`, `F.DIST.RT`, `F.INV`, `F.INV.RT`, `F.TEST`, `FDIST`, `FINV`, `FISHER`, `FISHERINV`, `FTEST`, `GAMMA.DIST`, `GAMMA.INV`, `GAMMADIST`, `GAMMAINV`, `GAUSS`, `HYPGEOMDIST`, `LOGINV`, `LOGNORM.DIST`, `LOGNORM.INV`, `LOGNORMDIST`, `MAX`, `MAXA`, `MAXIFS`, `MEDIAN`, `MIN`, `MINA`, `MINIFS`, `NEGBINOMDIST`, `NORM.DIST`, `NORM.INV`, `NORM.S.DIST`, `NORM.S.INV`, `NORMDIST`, `NORMINV`, `NORMSINV`, `PEARSON`, `PERCENTILE`, `PERCENTILE.EXC`, `PERCENTILE.INC`, `PHI`, `POISSON`, `QUARTILE`, `QUARTILE.EXC`, `QUARTILE.INC`, `RSQ`, `SKEW.P`, `SLOPE`, `SMALL`, `STANDARDIZE`, `STDEV`, `STDEVA`, `STDEVP`, `STDEVPA`, `STEYX`, `T.DIST.2T`, `T.DIST.RT`, `T.TEST`, `TINV`, `TTEST`, `VAR`, `VAR.P`, `VARA`, `VARPA`, `WEIBULL`, `Z.TEST`, `ZTEST`
- **Text (25):** `ARABIC`, `CHAR`, `CLEAN`, `CODE`, `CONCATENATE`, `EXACT`, `FIND`, `LEFT`, `LEN`, `LOWER`, `MID`, `PROPER`, `REPLACE`, `REPT`, `RIGHT`, `ROMAN`, `SEARCH`, `SUBSTITUTE`, `T`, `TEXTJOIN`, `TRIM`, `UNICHAR`, `UNICODE`, `UPPER`, `VALUE`
- **Web (1):** `HYPERLINK`

### Mapped

- **Date (6):** `DATEDIF`, `DATEVALUE`, `DAYS`, `EDATE`, `EOMONTH`, `TIMEVALUE`
- **Engineering (1):** `ERF.PRECISE`
- **Financial (8):** `DB`, `NPV`, `PV`, `RATE`, `RRI`, `TBILLEQ`, `TBILLPRICE`, `XNPV`
- **Info (1):** `ISREF`
- **Logical (1):** `IF`
- **Lookup (3):** `ADDRESS`, `COLUMNS`, `OFFSET`
- **Math (5):** `COMBIN`, `ERFC.PRECISE`, `GCD`, `LCM`, `SEQUENCE`
- **Operator (15):** `ADD`, `CONCAT`, `DIVIDE`, `EQ`, `GT`, `GTE`, `LT`, `LTE`, `MINUS`, `MULTIPLY`, `NE`, `POW`, `UMINUS`, `UNARY_PERCENT`, `UPLUS`
- **Statistical (26):** `AVEDEV`, `BETA.DIST`, `BETA.INV`, `BINOM.DIST`, `BINOM.INV`, `CHISQ.TEST`, `COUNTA`, `DEVSQ`, `GAMMA`, `GEOMEAN`, `HARMEAN`, `HYPGEOM.DIST`, `LARGE`, `NEGBINOM.DIST`, `NORMSDIST`, `POISSON.DIST`, `SKEW`, `STDEV.P`, `STDEV.S`, `T.DIST`, `T.INV`, `T.INV.2T`, `TDIST`, `VAR.S`, `VARP`, `WEIBULL.DIST`
- **Text (2):** `SPLIT`, `TEXT`

### Unsupported

- **Array (22):** `BYCOL`, `BYROW`, `CHOOSECOLS`, `CHOOSEROWS`, `FLATTEN`, `FREQUENCY`, `GROWTH`, `HSTACK`, `LINEST`, `LOGEST`, `MAKEARRAY`, `MAP`, `MDETERM`, `MINVERSE`, `REDUCE`, `SCAN`, `TOCOL`, `TOROW`, `TREND`, `VSTACK`, `WRAPCOLS`, `WRAPROWS`
- **Date (1):** `EPOCHTODATE`
- **Engineering (4):** `GESTEP`, `IMCOTH`, `IMLOG`, `IMTANH`
- **Filter (3):** `SORT`, `SORTN`, `UNIQUE`
- **Financial (22):** `ACCRINT`, `ACCRINTM`, `AMORLINC`, `COUPDAYBS`, `COUPDAYS`, `COUPDAYSNC`, `COUPNCD`, `COUPNUM`, `COUPPCD`, `DISC`, `DURATION`, `INTRATE`, `MDURATION`, `PRICE`, `PRICEDISC`, `PRICEMAT`, `RECEIVED`, `VDB`, `XIRR`, `YIELD`, `YIELDDISC`, `YIELDMAT`
- **Google (3):** `DETECTLANGUAGE`, `QUERY`, `SPARKLINE`
- **Info (5):** `CELL`, `ERROR.TYPE`, `ISDATE`, `ISEMAIL`, `TYPE`
- **Logical (2):** `LAMBDA`, `LET`
- **Lookup (3):** `GETPIVOTDATA`, `INDIRECT`, `LOOKUP`
- **Math (2):** `MUNIT`, `RANDARRAY`
- **Operator (1):** `ISBETWEEN`
- **Parser (6):** `CONVERT`, `TO_DATE`, `TO_DOLLARS`, `TO_PERCENT`, `TO_PURE_NUMBER`, `TO_TEXT`
- **Statistical (20):** `AVERAGE.WEIGHTED`, `AVERAGEIFS`, `FORECAST`, `FORECAST.LINEAR`, `INTERCEPT`, `KURT`, `MARGINOFERROR`, `MODE`, `MODE.MULT`, `MODE.SNGL`, `PERCENTRANK`, `PERCENTRANK.EXC`, `PERCENTRANK.INC`, `PERMUT`, `PERMUTATIONA`, `PROB`, `RANK`, `RANK.AVG`, `RANK.EQ`, `TRIMMEAN`
- **Text (14):** `ASC`, `DOLLAR`, `FINDB`, `FIXED`, `JOIN`, `LEFTB`, `LENB`, `MIDB`, `REGEXEXTRACT`, `REGEXMATCH`, `REGEXREPLACE`, `REPLACEB`, `RIGHTB`, `SEARCHB`
- **Web (2):** `ENCODEURL`, `ISURL`

### Volatile

- **Date (2):** `NOW`, `TODAY`
- **Math (2):** `RAND`, `RANDBETWEEN`

HyperFormula also identifies `COLUMN`, `ROW`, `COLUMNS`, `ROWS`, and `FORMULATEXT` as structure-dependent. They remain in exact-candidate or mapped buckets above but require structural-edit fixtures.

### External

- **AI (1):** `AI`
- **Google (3):** `GOOGLEFINANCE`, `GOOGLETRANSLATE`, `IMAGE`
- **Web (5):** `IMPORTDATA`, `IMPORTFEED`, `IMPORTHTML`, `IMPORTRANGE`, `IMPORTXML`

## Import And Runtime Policy

For every imported formula, retain the original formula, source locale/timezone, source effective value, displayed value, normalized AST or parse failure, function dispositions, dependency references, target result, compatibility state, and warnings.

- Exact-candidates may be evaluated only after parser and semantic fixtures for the pinned engine version.
- Mapped functions must record the applied mapping version and keep the source formula unchanged.
- Unsupported and external functions preserve the source formula and cached/effective value and remain visibly stale until replaced or supported.
- Volatile functions require an explicit recalculation policy; import must not silently refresh them.
- External functions must never execute as a side effect of upload, preview, or ordinary workbook opening.

This completes the historical inventory. A later formula spec may revive P-003
to prove compatibility; Spec 00001 must not execute it.
