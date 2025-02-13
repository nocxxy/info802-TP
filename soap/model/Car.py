from spyne.model.complex import ComplexModel
from spyne.model.primitive import Float    

class Car(ComplexModel):
    rechargeTime = Float
    autonomie = Float