-- Shared reference catalogue (user_id = null). Idempotent.
-- rth_open/rth_close are exchange-local times; the app converts for display.

insert into edge_domains (user_id, key, label, description, sort_order) values
  (null,'economic_data','Economic data','Scheduled economic data releases and their revisions.',1),
  (null,'central_banks','Central banks','Policy decisions, speakers, minutes and forward guidance.',2),
  (null,'technicals','Technicals','Charts, order flow, market profile and the price ladder.',3),
  (null,'flow_events','Flow events','OPEX, month/quarter end, opens and closes, rebalances, auctions.',4),
  (null,'unscheduled_news','Unscheduled news','Geopolitics, crises, tariffs and narrative shocks.',5)
on conflict do nothing;

insert into level_types (user_id, key, label, grouping, sort_order) values
  (null,'excess_high','Excess high','profile',1),
  (null,'excess_low','Excess low','profile',2),
  (null,'tail','Tail','profile',3),
  (null,'HVN','HVN','profile',4),
  (null,'LVN','LVN','profile',5),
  (null,'POC','POC','profile',6),
  (null,'VAH','VAH','profile',7),
  (null,'VAL','VAL','profile',8),
  (null,'ONH','Overnight high','session',9),
  (null,'ONL','Overnight low','session',10),
  (null,'IBH','Initial balance high','session',11),
  (null,'IBL','Initial balance low','session',12),
  (null,'prior_settle','Prior settlement','session',13),
  (null,'prior_high','Prior high','session',14),
  (null,'prior_low','Prior low','session',15),
  (null,'open_price','Open','session',16),
  (null,'VWAP','VWAP','derived',17),
  (null,'VWAP_band','VWAP band','derived',18),
  (null,'gamma_wall','Gamma wall','options',19),
  (null,'call_wall','Call wall','options',20),
  (null,'put_wall','Put wall','options',21),
  (null,'trendline','Trendline','chart',22),
  (null,'horizontal','Horizontal','chart',23),
  (null,'other','Other','other',99)
on conflict do nothing;

insert into instruments
  (user_id, symbol, name, exchange, product_group, tick_size, tick_value, point_value, currency, rth_open, rth_close, sort_order) values
  (null,'ES','E-mini S&P 500','CME','equity_index',0.25,12.50,50,'USD','09:30','16:15',1),
  (null,'NQ','E-mini Nasdaq 100','CME','equity_index',0.25,5.00,20,'USD','09:30','16:15',2),
  (null,'RTY','E-mini Russell 2000','CME','equity_index',0.10,5.00,50,'USD','09:30','16:15',3),
  (null,'YM','E-mini Dow','CBOT','equity_index',1,5.00,5,'USD','09:30','16:15',4),
  (null,'CL','Crude oil','NYMEX','energy',0.01,10.00,1000,'USD','09:00','14:30',10),
  (null,'NG','Natural gas','NYMEX','energy',0.001,10.00,10000,'USD','09:00','14:30',11),
  (null,'GC','Gold','COMEX','metals',0.10,10.00,100,'USD','08:20','13:30',20),
  (null,'SI','Silver','COMEX','metals',0.005,25.00,5000,'USD','08:25','13:25',21),
  (null,'HG','Copper','COMEX','metals',0.0005,12.50,25000,'USD','08:10','13:00',22),
  (null,'ZT','2-year note','CBOT','rates',0.00390625,7.8125,2000,'USD','08:20','15:00',30),
  (null,'ZF','5-year note','CBOT','rates',0.0078125,7.8125,1000,'USD','08:20','15:00',31),
  (null,'ZN','10-year note','CBOT','rates',0.015625,15.625,1000,'USD','08:20','15:00',32),
  (null,'ZB','30-year bond','CBOT','rates',0.03125,31.25,1000,'USD','08:20','15:00',33),
  (null,'UB','Ultra bond','CBOT','rates',0.03125,31.25,1000,'USD','08:20','15:00',34),
  (null,'FGBL','Euro-Bund','Eurex','rates',0.01,10.00,1000,'EUR','08:00','22:00',35),
  (null,'6E','Euro FX','CME','fx',0.00005,6.25,125000,'USD','07:20','14:00',40),
  (null,'6J','Japanese yen','CME','fx',0.0000005,6.25,12500000,'USD','07:20','14:00',41),
  (null,'6B','British pound','CME','fx',0.0001,6.25,62500,'USD','07:20','14:00',42),
  (null,'6A','Australian dollar','CME','fx',0.0001,10.00,100000,'USD','07:20','14:00',43),
  (null,'BTC','Bitcoin futures','CME','crypto',5.00,25.00,5,'USD','09:30','16:00',50),
  (null,'ETH','Ether futures','CME','crypto',0.50,25.00,50,'USD','09:30','16:00',51)
on conflict do nothing;
