import asyncio
from luna.bot import Bot
from luna.core import Store,Settings

def make(tmp_path,**kw):
    class MockBot(Bot):
        async def call(self,method,**data):self.calls.append((method,data));return True
    cfg=Settings(token='test',admins=(1,),**kw);b=MockBot(cfg,Store(tmp_path/'db'),None);b.calls=[];return b

def update(text,uid=5):return {'update_id':1,'message':{'from':{'id':uid},'chat':{'id':uid,'type':'private'},'text':text}}

def test_disabled_sales_do_not_invoice(tmp_path):
    b=make(tmp_path);asyncio.run(b.handle(update('Купить VPN')))
    assert [m for m,_ in b.calls]==['sendMessage']
    assert 'не открыты' in b.calls[0][1]['text']

def test_non_admin_cannot_grant(tmp_path):
    b=make(tmp_path);asyncio.run(b.handle(update('/grant 5 30 https://sub.example/a')))
    assert b.db.config(5) is None

def test_precheckout_checks_owner(tmp_path):
    b=make(tmp_path,sales=True,stars=100);oid=b.db.order(5,100)
    p={'id':'q','from':{'id':6},'invoice_payload':oid,'currency':'XTR','total_amount':100}
    asyncio.run(b.handle({'pre_checkout_query':p}));assert not b.calls[-1][1]['ok']
    p['from']['id']=5;asyncio.run(b.handle({'pre_checkout_query':p}));assert b.calls[-1][1]['ok']

def test_admin_refund_calls_telegram_once(tmp_path):
    b=make(tmp_path);oid=b.db.order(5,100);b.db.payment(oid,5,'XTR',100,'charge')
    asyncio.run(b.handle(update('/refund '+oid,1)))
    asyncio.run(b.handle(update('/refund '+oid,1)))
    refunds=[d for m,d in b.calls if m=='refundStarPayment']
    assert refunds==[{'user_id':5,'telegram_payment_charge_id':'charge'}]
