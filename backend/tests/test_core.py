import hashlib, hmac, json, time
from urllib.parse import urlencode
import pytest
from fastapi.testclient import TestClient
from luna.core import Store, Settings, validate_init_data
from luna.api import create_app

TOKEN='test:local-only-token'
def signed(uid=51, now=None, token=TOKEN):
    fields={'auth_date':str(int(time.time()) if now is None else now),'user':json.dumps({'id':uid}),'query_id':'test'}
    key=hmac.new(b'WebAppData',token.encode(),hashlib.sha256).digest()
    fields['hash']=hmac.new(key,'\n'.join(f'{k}={v}' for k,v in sorted(fields.items())).encode(),hashlib.sha256).hexdigest()
    return urlencode(fields)

@pytest.fixture
def db(tmp_path):return Store(tmp_path/'luna.sqlite3')

def test_auth_valid_and_tampering():
    assert validate_init_data(signed(),TOKEN)==51
    with pytest.raises(ValueError):validate_init_data(signed().replace('51','52'),TOKEN)
    with pytest.raises(ValueError):validate_init_data(signed(),TOKEN+'wrong')

@pytest.mark.parametrize('age',[3601,-61])
def test_auth_expiry(age):
    with pytest.raises(ValueError):validate_init_data(signed(now=int(time.time())-age),TOKEN)

def test_auth_duplicate_field():
    with pytest.raises(ValueError):validate_init_data(signed()+'&auth_date=1',TOKEN)

def test_no_data_leak_between_accounts(db):
    db.grant(51,30,'https://subscription.example/private')
    client=TestClient(create_app(Settings(token=TOKEN),db))
    assert client.get('/api/me').status_code==401
    assert client.get('/api/config',headers={'X-Telegram-Init-Data':signed(52)}).status_code==404
    r=client.get('/api/config',headers={'X-Telegram-Init-Data':signed()})
    assert r.json()['subscription_url']=='https://subscription.example/private'
    assert r.headers['cache-control']=='no-store'

def test_payment_once_and_identity(db):
    oid=db.order(51,100)
    assert not db.can_pay(oid,52,'XTR',100)
    assert not db.can_pay(oid,51,'RUB',100)
    assert not db.can_pay(oid,51,'XTR',99)
    assert db.can_pay(oid,51,'XTR',100)
    assert db.payment(oid,51,'XTR',100,'charge-1',(1,))
    assert not db.payment(oid,51,'XTR',100,'charge-1',(1,))
    with db.connection() as c:assert c.execute('SELECT count(*) FROM outbox').fetchone()[0]==2
    with pytest.raises(ValueError):db.payment(oid,52,'XTR',100,'charge-1')

def test_each_paid_order_fulfilled_separately_and_renewal(db):
    a,b=db.order(51,100),db.order(51,100)
    db.payment(a,51,'XTR',100,'a');db.payment(b,51,'XTR',100,'b')
    with pytest.raises(ValueError):db.grant(51,30,'https://sub.example/a')
    first=db.grant(51,30,'https://sub.example/a',a)
    assert db.status(51)['pending_provision']
    second=db.grant(51,30,'https://sub.example/a',b)
    assert second-first==30*86400
    assert not db.status(51)['pending_provision']
    with pytest.raises(ValueError):db.grant(51,30,'https://sub.example/a',b)

def test_revoke_and_expiry(db):
    db.grant(51,30,'https://sub.example/a');assert db.config(51)
    with db.connection() as c:c.execute('UPDATE access SET expires_at=1')
    assert not db.config(51);assert not db.status(51)['active']
    db.grant(51,1,'https://sub.example/a');db.revoke(51)
    assert not db.config(51)

def test_refund_state(db):
    oid=db.order(51,100);db.payment(oid,51,'XTR',100,'charge')
    assert db.refundable_order(oid)['charge_id']=='charge'
    db.refunded(oid);assert db.refundable_order(oid) is None

def test_sales_configuration_guard():
    with pytest.raises(ValueError):Settings(token=TOKEN,sales=True).validate()
    Settings(token=TOKEN,sales=True,stars=100,admins=(1,),support='operator',terms='https://example.com/terms',privacy='https://example.com/privacy').validate()

@pytest.mark.parametrize('url',['http://example.com/a','https://user:pass@example.com/a','javascript:alert(1)'])
def test_reject_unsafe_subscription(db,url):
    with pytest.raises(ValueError):db.grant(51,30,url)
