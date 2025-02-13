import os
from spyne import Application
from spyne.decorator import rpc
from spyne.protocol.soap import Soap11
from spyne.service import ServiceBase
from spyne.server.wsgi import WsgiApplication

from spyne.model.complex import Array
from spyne.model.primitive import Float
from spyne.model.complex import Iterable

from model.Car import Car

print("Starting application...")

class TimeAndPriceService(ServiceBase):

    @rpc(Array(Float), Car, Float, _returns=Iterable(Float))
    def Time(ctx, bornes, car, distanceTime):
        time = distanceTime
        for borne in bornes:
            time += car.rechargeTime
        yield time

    @rpc(Array(Float), Car, _returns=Iterable(Float))
    def Price(ctx, bornes, car):
        price = 0
        for borne in bornes:
            price += (car.rechargeTime / 60) * 0.52  # Si on a plus d'info sur les bornes, on pourra changer
        yield price

application = Application([TimeAndPriceService], 'spyne.examples.hello.soap',
    in_protocol=Soap11(validator='lxml'),
    out_protocol=Soap11())

app = WsgiApplication(application)

# Azure Web App exécute Gunicorn, donc on ne lance pas `make_server()`
if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8000))
    from wsgiref.simple_server import make_server
    server = make_server('0.0.0.0', port, app)
    print(f"Server running on port {port}...")
    server.serve_forever()
